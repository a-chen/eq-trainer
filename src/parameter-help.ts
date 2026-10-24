const explanations = {
  gain: {
    title: "dB — EQ gain",
    description:
      "Decibels describe how much the EQ boosts or cuts the selected frequency. Positive values boost, negative values cut, and 0 dB leaves it unchanged. Larger changes are easier to hear. This is not your listening volume.",
  },
  q: {
    title: "Q — bandwidth",
    description:
      "Q controls the width of the EQ bell. Lower Q affects a wider range of frequencies; higher Q focuses on a narrower range. Narrower changes are generally harder to hear.",
  },
} as const;

type Parameter = keyof typeof explanations;

export function parameterHelpAttributes(parameter: Parameter) {
  return `data-parameter-help="${parameter}" aria-describedby="eq-${parameter}-help"`;
}

export function parameterValue(
  parameter: Parameter,
  content: string,
  attributes = "",
  focusable = true,
) {
  return `<span class="parameter-hint" ${parameterHelpAttributes(parameter)} ${focusable ? 'tabindex="0"' : ""} ${attributes}>${content}</span>`;
}

export function parameterHelpMarkup() {
  return Object.entries(explanations)
    .map(
      ([parameter, explanation]) =>
        `<div id="eq-${parameter}-help" class="parameter-tooltip" role="tooltip" popover="manual"><strong>${explanation.title}</strong><p>${explanation.description}</p></div>`,
    )
    .join("");
}

export function initParameterHelp() {
  let trigger: HTMLElement | null = null;
  let tooltip: HTMLElement | null = null;
  let pinned = false;
  let keyboardInteraction = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function hide() {
    clearTimeout(closeTimer);
    tooltip?.hidePopover();
    tooltip = null;
    trigger = null;
    pinned = false;
  }

  function show(target: HTMLElement) {
    if (!target.checkVisibility()) return;
    clearTimeout(closeTimer);
    if (trigger === target) return;
    hide();
    trigger = target;
    tooltip = document.getElementById(
      `eq-${target.dataset.parameterHelp}-help`,
    )!;
    // Keep help inside the active modal/popup, rather than in its inert background.
    (target.closest("dialog, [popover]") ?? document.body).append(tooltip);
    tooltip.showPopover();
    position();
  }

  function position() {
    if (!trigger || !tooltip) return;
    const bounds = trigger.getBoundingClientRect();
    if (
      !trigger.checkVisibility() ||
      bounds.bottom < 0 ||
      bounds.top > innerHeight
    ) {
      hide();
      return;
    }
    const size = tooltip.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(
        bounds.left + bounds.width / 2 - size.width / 2,
        innerWidth - size.width - 12,
      ),
    );
    const below = bounds.bottom + 8;
    const top =
      below + size.height <= innerHeight - 12
        ? below
        : bounds.top - size.height - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, Math.min(top, innerHeight - size.height - 12))}px`;
  }

  function scheduleHide() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (
        pinned ||
        trigger?.matches(":hover, :focus") ||
        tooltip?.matches(":hover")
      )
        return;
      hide();
    }, 100);
  }

  function hintAt(target: EventTarget | null) {
    return target instanceof Element
      ? target.closest<HTMLElement>("[data-parameter-help]")
      : null;
  }

  document.addEventListener("pointerover", (event) => {
    if (
      keyboardInteraction ||
      (event.pointerType !== "mouse" && event.pointerType !== "pen")
    )
      return;
    const target = hintAt(event.target);
    if (target) show(target);
    else if (event.target instanceof Node && tooltip?.contains(event.target))
      clearTimeout(closeTimer);
  });
  // A disappearing tooltip can expose a stationary pointer over an old value.
  // Do not let that override the parameter the user is adjusting by keyboard.
  document.addEventListener("pointermove", (event) => {
    if (!keyboardInteraction || !(event.movementX || event.movementY)) return;
    keyboardInteraction = false;
    const target = hintAt(event.target);
    if (target) show(target);
  });
  document.addEventListener("pointerdown", () => {
    keyboardInteraction = false;
  });
  document.addEventListener("pointerout", (event) => {
    if (
      event.relatedTarget instanceof Node &&
      (trigger?.contains(event.relatedTarget) ||
        tooltip?.contains(event.relatedTarget))
    )
      return;
    scheduleHide();
  });
  document.addEventListener("focusin", (event) => {
    const target = hintAt(event.target);
    if (target) show(target);
    else hide();
  });
  document.addEventListener("focusout", scheduleHide);
  document.addEventListener("click", (event) => {
    const target = hintAt(event.target);
    if (target) {
      // Reading a value inside a label must not activate/change its slider.
      if (target.closest("label") && !target.matches("input"))
        event.preventDefault();
      if (trigger === target && pinned) hide();
      else {
        show(target);
        pinned = true;
      }
    } else if (
      !(event.target instanceof Node && tooltip?.contains(event.target))
    )
      hide();
  });
  document.addEventListener(
    "keydown",
    (event) => {
      keyboardInteraction = true;
      if (event.key !== "Escape" || !tooltip) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
    },
    true,
  );
  // A hidden popup or mode must not leave a detached explanation on screen.
  document.addEventListener(
    "beforetoggle",
    (event) => {
      if (
        (event as ToggleEvent).newState === "closed" &&
        event.target instanceof HTMLElement &&
        trigger &&
        event.target.contains(trigger)
      )
        hide();
    },
    true,
  );
  document.addEventListener(
    "scroll",
    (event) => {
      if (!(event.target instanceof Node && tooltip?.contains(event.target)))
        position();
    },
    true,
  );
  window.addEventListener("resize", position);
  window.addEventListener("pagehide", hide);
  return hide;
}
