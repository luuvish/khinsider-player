import blessed from 'blessed';
import { escapeBlessedMarkup } from './formatters.js';

// SECURITY: Credential length limits to prevent memory exhaustion and DoS
const MAX_USERNAME_LENGTH = 128;
const MAX_PASSWORD_LENGTH = 512;
// SECURITY: Minimum 8 characters to enforce basic password strength
const MIN_PASSWORD_LENGTH = 8;

interface LoginFormOptions {
  screen: blessed.Widgets.Screen;
  title?: string;
  subtitle?: string;
  credentials?: { username?: string; password?: string };
  onSubmit?: (username: string, password: string) => void | Promise<void>;
  onCancel?: () => void;
  setDialogActive?: (active: boolean) => void;
}

/**
 * Creates a reusable login form dialog
 */
export function showLoginForm(options: LoginFormOptions) {
  const {
    screen,
    title = 'Login',
    subtitle = '',
    credentials = {},
    onSubmit,
    onCancel,
    setDialogActive
  } = options;

  // SECURITY: Only pre-populate username, never the password
  // Storing passwords in memory for longer than necessary is a security risk
  const usernameValue = credentials.username || '';
  // Password is intentionally NOT pre-populated for security
  const passwordValue = '';

  const dialogBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 12,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      bg: 'black'
    }
  });

  // Escape user-provided content to prevent blessed markup injection
  const safeTitle = escapeBlessedMarkup(title);
  const safeSubtitle = escapeBlessedMarkup(subtitle);
  const safeUsername = escapeBlessedMarkup(usernameValue);
  const subtitleLine = safeSubtitle ? `\n  {cyan-fg}${safeSubtitle}{/cyan-fg}` : '';

  dialogBox.setContent(`
  {bold}${safeTitle}{/bold}${subtitleLine}

  Username: [ ${safeUsername.padEnd(25)} ]
  Password: [ ${'*'.repeat(passwordValue.length).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Submit  [Esc] Cancel{/gray-fg}
`);

  const usernameInput = blessed.textbox({
    parent: dialogBox,
    top: subtitle ? 4 : 3,
    left: 12,
    width: 29,
    height: 1,
    style: {
      fg: 'white',
      bg: 'black',
      focus: { fg: 'yellow', bg: 'black' }
    }
  });

  const passwordInput = blessed.textbox({
    parent: dialogBox,
    top: subtitle ? 5 : 4,
    left: 12,
    width: 29,
    height: 1,
    censor: true,
    style: {
      fg: 'white',
      bg: 'black',
      focus: { fg: 'yellow', bg: 'black' }
    }
  });

  usernameInput.setValue(usernameValue);
  passwordInput.setValue(passwordValue);

  let switchingField = false;
  let isCleanedUp = false;

  if (setDialogActive) {
    setDialogActive(true);
  }

  // Store escape key handler reference for proper cleanup
  const escapeHandler = () => {
    cancel();
  };

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    // Remove all listeners before destroying
    usernameInput.removeAllListeners();
    passwordInput.removeAllListeners();
    dialogBox.removeAllListeners();

    // Remove key handlers (not covered by removeAllListeners)
    dialogBox.unkey('escape', escapeHandler);

    if (setDialogActive) {
      setDialogActive(false);
    }

    dialogBox.destroy();
    screen.render();
  };

  const submit = () => {
    const username = usernameInput.getValue().trim();
    const password = passwordInput.getValue().trim();

    // SECURITY: Validate credential lengths before processing
    if (!username) {
      // Show error and refocus - don't cleanup yet
      dialogBox.setContent(`
  {bold}${safeTitle}{/bold}${subtitleLine}
  {red-fg}Error: Username is required{/red-fg}

  Username: [ ${escapeBlessedMarkup(username).padEnd(25)} ]
  Password: [ ${'*'.repeat(password.length).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Submit  [Esc] Cancel{/gray-fg}
`);
      screen.render();
      focusUsername();
      return;
    }

    if (username.length > MAX_USERNAME_LENGTH) {
      dialogBox.setContent(`
  {bold}${safeTitle}{/bold}${subtitleLine}
  {red-fg}Error: Username too long (max ${MAX_USERNAME_LENGTH} chars){/red-fg}

  Username: [ ${escapeBlessedMarkup(username.slice(0, 25)).padEnd(25)} ]
  Password: [ ${'*'.repeat(Math.min(password.length, 25)).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Submit  [Esc] Cancel{/gray-fg}
`);
      screen.render();
      focusUsername();
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      dialogBox.setContent(`
  {bold}${safeTitle}{/bold}${subtitleLine}
  {red-fg}Error: Password must be at least ${MIN_PASSWORD_LENGTH} characters{/red-fg}

  Username: [ ${escapeBlessedMarkup(username).padEnd(25)} ]
  Password: [ ${'*'.repeat(password.length).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Submit  [Esc] Cancel{/gray-fg}
`);
      screen.render();
      focusPassword();
      return;
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      dialogBox.setContent(`
  {bold}${safeTitle}{/bold}${subtitleLine}
  {red-fg}Error: Password too long (max ${MAX_PASSWORD_LENGTH} chars){/red-fg}

  Username: [ ${escapeBlessedMarkup(username).padEnd(25)} ]
  Password: [ ${'*'.repeat(Math.min(password.length, 25)).padEnd(25)} ]

  {gray-fg}[Tab] Switch  [Enter] Submit  [Esc] Cancel{/gray-fg}
`);
      screen.render();
      focusPassword();
      return;
    }

    cleanup();
    if (onSubmit) {
      try {
        const result = onSubmit(username, password);
        // Handle async callbacks - errors are handled by the caller's try-catch
        // but we need to prevent unhandled rejection warnings
        if (result && typeof result.catch === 'function') {
          result.catch((error: unknown) => {
            // Error should already be handled by caller's try-catch in onSubmit
            // This catch prevents unhandled promise rejection warning
            // Note: Using process.stderr instead of console to avoid TUI corruption
            process.stderr.write(`Login form submit error: ${error instanceof Error ? error.message : error}\n`);
          });
        }
      } catch (error: unknown) {
        // Sync errors - log for debugging
        process.stderr.write(`Login form submit error: ${error instanceof Error ? error.message : error}\n`);
      }
    }
  };

  const cancel = () => {
    cleanup();
    if (onCancel) {
      onCancel();
    }
  };

  const focusUsername = () => {
    usernameInput.readInput();
  };

  const focusPassword = () => {
    passwordInput.readInput();
  };

  // Use setImmediate instead of setTimeout for more reliable timing
  const switchToPassword = () => {
    switchingField = true;
    usernameInput.cancel();
  };

  const switchToUsername = () => {
    switchingField = true;
    passwordInput.cancel();
  };

  // Username input events
  usernameInput.on('submit', () => {
    focusPassword();
  });

  usernameInput.on('cancel', () => {
    if (switchingField) {
      switchingField = false;
      setImmediate(() => focusPassword());
    } else {
      cancel();
    }
  });

  usernameInput.on('keypress', (ch, key) => {
    if (key && key.name === 'tab') {
      switchToPassword();
      return false;
    }
  });

  // Password input events
  passwordInput.on('submit', () => {
    submit();
  });

  passwordInput.on('cancel', () => {
    if (switchingField) {
      switchingField = false;
      setImmediate(() => focusUsername());
    } else {
      cancel();
    }
  });

  passwordInput.on('keypress', (ch, key) => {
    if (key && key.name === 'tab') {
      switchToUsername();
      return false;
    }
  });

  // Escape key on dialog (using stored handler for proper cleanup)
  dialogBox.key(['escape'], escapeHandler);

  screen.render();
  focusUsername();

  // Return cleanup function for external use if needed
  return { cleanup };
}
