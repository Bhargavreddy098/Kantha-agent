interface FocusOptions {
  focusVisible?: boolean;
}

interface ShowPopoverOptions {
  source?: HTMLElement;
}

interface HTMLElement {
  showPopover(options?: ShowPopoverOptions): void;
}
