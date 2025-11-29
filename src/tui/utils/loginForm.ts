import blessed from 'blessed';

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

  const usernameValue = credentials.username || '';
  const passwordValue = credentials.password || '';

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

  const subtitleLine = subtitle ? `\n  {cyan-fg}${subtitle}{/cyan-fg}` : '';

  dialogBox.setContent(`
  {bold}${title}{/bold}${subtitleLine}

  Username: [ ${usernameValue.padEnd(25)} ]
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
            console.error('Login form submit error:', error instanceof Error ? error.message : error);
          });
        }
      } catch (error: unknown) {
        // Sync errors - log for debugging
        console.error('Login form submit error:', error instanceof Error ? error.message : error);
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
