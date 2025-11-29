import blessed from 'blessed';

/**
 * Creates a reusable login form dialog
 * @param {Object} options
 * @param {Object} options.screen - blessed screen instance
 * @param {string} options.title - Dialog title
 * @param {string} options.subtitle - Optional subtitle text
 * @param {Object} options.credentials - Initial credentials { username, password }
 * @param {Function} options.onSubmit - Callback(username, password) when form is submitted
 * @param {Function} options.onCancel - Callback when form is cancelled
 * @param {Function} options.setDialogActive - Callback to set dialog active state
 */
export function showLoginForm(options) {
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

  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;

    // Remove all listeners before destroying
    usernameInput.removeAllListeners();
    passwordInput.removeAllListeners();
    dialogBox.removeAllListeners();

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
        // Handle async callbacks
        if (result && typeof result.catch === 'function') {
          result.catch(() => {
            // Errors handled by caller
          });
        }
      } catch {
        // Errors handled by caller
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

  // Escape key on dialog
  dialogBox.key(['escape'], () => {
    cancel();
  });

  screen.render();
  focusUsername();

  // Return cleanup function for external use if needed
  return { cleanup };
}
