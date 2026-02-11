/**
 * UI Helper Module - Modern Console Styling
 * ใช้สำหรับ ANSI colors และ styling ที่สวยงามและสม่ำเสมอ
 */

// ANSI Color Codes
const c = {
  // Reset
  reset: '\u001b[0m',

  // Styles
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  italic: '\u001b[3m',
  underline: '\u001b[4m',
  inverse: '\u001b[7m',

  // Foreground Colors
  black: '\u001b[30m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  white: '\u001b[37m',

  // Bright Foreground Colors
  brightBlack: '\u001b[90m',
  brightRed: '\u001b[91m',
  brightGreen: '\u001b[92m',
  brightYellow: '\u001b[93m',
  brightBlue: '\u001b[94m',
  brightMagenta: '\u001b[95m',
  brightCyan: '\u001b[96m',
  brightWhite: '\u001b[97m',

  // Background Colors
  bgBlack: '\u001b[40m',
  bgRed: '\u001b[41m',
  bgGreen: '\u001b[42m',
  bgYellow: '\u001b[43m',
  bgBlue: '\u001b[44m',
  bgMagenta: '\u001b[45m',
  bgCyan: '\u001b[46m',
  bgWhite: '\u001b[47m',
};

// Icons
const icons = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  check: '✓',
  cross: '✗',
  arrow: '➜',
  bullet: '•',
  star: '★',
  rocket: '🚀',
  package: '📦',
  lock: '🔐',
  globe: '🌐',
  folder: '📁',
  file: '📄',
  trash: '🗑️',
  settings: '⚙️',
  clock: '⏰',
  lightning: '⚡',
  fire: '🔥',
  sparkles: '✨',
  checkmark: '☑️',
  pending: '⏳',
  done: '✔️',
  skip: '⊘',
  docker: '🐳',
  cloud: '☁️',
  dns: '🔗',
  tip: '💡',
  note: '📝',
  list: '📋',
};

/**
 * Get terminal width (default 80)
 */
function getWidth() {
  return process.stdout.columns || 80;
}

/**
 * Create a gradient-style header
 */
function header(title, subtitle = null) {
  const width = Math.min(getWidth() - 4, 60);
  const line = '═'.repeat(width - 2);

  console.log('');
  console.log(`${c.cyan}${c.bold}╔${line}╗${c.reset}`);
  console.log(`${c.cyan}${c.bold}║${c.reset}  ${c.brightCyan}${c.bold}${title.padEnd(width - 5)}${c.reset}${c.cyan}${c.bold}║${c.reset}`);
  if (subtitle) {
    console.log(`${c.cyan}${c.bold}║${c.reset}  ${c.dim}${subtitle.padEnd(width - 5)}${c.reset}${c.cyan}${c.bold}║${c.reset}`);
  }
  console.log(`${c.cyan}${c.bold}╚${line}╝${c.reset}`);
  console.log('');
}

/**
 * Create a warning header (red/yellow)
 */
function warningHeader(title, subtitle = null) {
  const width = Math.min(getWidth() - 4, 60);
  const line = '═'.repeat(width - 2);

  console.log('');
  console.log(`${c.red}${c.bold}╔${line}╗${c.reset}`);
  console.log(`${c.red}${c.bold}║${c.reset}  ${c.brightYellow}${c.bold}${title.padEnd(width - 5)}${c.reset}${c.red}${c.bold}║${c.reset}`);
  if (subtitle) {
    console.log(`${c.red}${c.bold}║${c.reset}  ${c.yellow}${subtitle.padEnd(width - 5)}${c.reset}${c.red}${c.bold}║${c.reset}`);
  }
  console.log(`${c.red}${c.bold}╚${line}╝${c.reset}`);
  console.log('');
}

/**
 * Print success message
 */
function success(msg) {
  console.log(`${c.green}${icons.success} ${msg}${c.reset}`);
}

/**
 * Print error message
 */
function error(msg) {
  console.log(`${c.red}${icons.error} ${msg}${c.reset}`);
}

/**
 * Print warning message
 */
function warning(msg) {
  console.log(`${c.yellow}${icons.warning}  ${msg}${c.reset}`);
}

/**
 * Print info message
 */
function info(msg) {
  console.log(`${c.blue}${icons.info}  ${msg}${c.reset}`);
}

/**
 * Print a step indicator
 */
function step(current, total, msg) {
  const progress = `[${current}/${total}]`;
  console.log(`\n${c.cyan}${c.bold}${progress}${c.reset} ${c.brightWhite}${msg}${c.reset}`);
}

/**
 * Print a sub-step (indented)
 */
function subStep(msg, status = 'pending') {
  const statusIcon = status === 'success' ? `${c.green}${icons.check}`
    : status === 'error' ? `${c.red}${icons.cross}`
      : status === 'skip' ? `${c.dim}${icons.skip}`
        : `${c.yellow}${icons.arrow}`;
  console.log(`   ${statusIcon} ${msg}${c.reset}`);
}

/**
 * Print a divider line
 */
function divider(char = '─') {
  const width = Math.min(getWidth() - 4, 60);
  console.log(`${c.dim}${char.repeat(width)}${c.reset}`);
}

/**
 * Print a section title
 */
function section(title) {
  console.log(`\n${c.bold}${c.brightMagenta}${icons.arrow} ${title}${c.reset}`);
}

/**
 * Create a box with content
 */
function box(title, lines) {
  const width = Math.min(getWidth() - 4, 60);
  const innerWidth = width - 4;

  console.log('');
  console.log(`${c.dim}┌${'─'.repeat(width - 2)}┐${c.reset}`);
  console.log(`${c.dim}│${c.reset} ${c.bold}${c.brightWhite}${title.padEnd(innerWidth)}${c.reset} ${c.dim}│${c.reset}`);
  console.log(`${c.dim}├${'─'.repeat(width - 2)}┤${c.reset}`);

  lines.forEach(line => {
    const truncated = line.length > innerWidth ? line.slice(0, innerWidth - 3) + '...' : line;
    console.log(`${c.dim}│${c.reset} ${truncated.padEnd(innerWidth)} ${c.dim}│${c.reset}`);
  });

  console.log(`${c.dim}└${'─'.repeat(width - 2)}┘${c.reset}`);
}

/**
 * Create a summary box (with colors for key-value pairs)
 */
function summaryBox(title, items) {
  const width = Math.min(getWidth() - 4, 60);
  const innerWidth = width - 4;

  console.log('');
  console.log(`${c.green}┌${'─'.repeat(width - 2)}┐${c.reset}`);
  console.log(`${c.green}│${c.reset} ${c.bold}${c.brightGreen}${title.padEnd(innerWidth)}${c.reset} ${c.green}│${c.reset}`);
  console.log(`${c.green}├${'─'.repeat(width - 2)}┤${c.reset}`);

  items.forEach(([key, value]) => {
    const line = `${c.dim}${key}:${c.reset} ${c.brightWhite}${value}${c.reset}`;
    const plainLine = `${key}: ${value}`;
    const padding = innerWidth - plainLine.length;
    console.log(`${c.green}│${c.reset} ${line}${' '.repeat(Math.max(0, padding))} ${c.green}│${c.reset}`);
  });

  console.log(`${c.green}└${'─'.repeat(width - 2)}┘${c.reset}`);
}

/**
 * Print a tip/hint
 */
function tip(msg) {
  console.log(`${c.dim}${icons.tip} ${msg}${c.reset}`);
}

/**
 * Print next steps
 */
function nextSteps(steps) {
  console.log(`\n${c.bold}${c.brightCyan}Next Steps:${c.reset}`);
  steps.forEach((s, i) => {
    console.log(`  ${c.cyan}${i + 1}.${c.reset} ${s}`);
  });
  console.log('');
}

/**
 * Print command example
 */
function command(cmd, description = null) {
  if (description) {
    console.log(`  ${c.dim}${description}${c.reset}`);
  }
  console.log(`  ${c.bgBlack}${c.brightGreen} ${cmd} ${c.reset}`);
}

/**
 * Print a table row
 */
function tableRow(columns, widths) {
  let row = '  ';
  columns.forEach((col, i) => {
    const w = widths[i] || 20;
    const text = String(col).slice(0, w);
    row += text.padEnd(w) + ' ';
  });
  console.log(row);
}

/**
 * Print table header
 */
function tableHeader(columns, widths) {
  let row = '  ';
  columns.forEach((col, i) => {
    const w = widths[i] || 20;
    row += `${c.bold}${c.brightWhite}${col.padEnd(w)}${c.reset} `;
  });
  console.log(row);
  console.log(`  ${c.dim}${'─'.repeat(widths.reduce((a, b) => a + b + 1, 0))}${c.reset}`);
}

/**
 * Clear the console
 */
function clear() {
  console.clear();
}

/**
 * Print completion banner
 */
function complete(msg) {
  console.log('');
  console.log(`${c.green}${c.bold}${'═'.repeat(50)}${c.reset}`);
  console.log(`${c.green}${c.bold}  ${icons.sparkles} ${msg} ${icons.sparkles}${c.reset}`);
  console.log(`${c.green}${c.bold}${'═'.repeat(50)}${c.reset}`);
  console.log('');
}

/**
 * Print failure banner
 */
function fail(msg) {
  console.log('');
  console.log(`${c.red}${c.bold}${'═'.repeat(50)}${c.reset}`);
  console.log(`${c.red}${c.bold}  ${icons.error} ${msg}${c.reset}`);
  console.log(`${c.red}${c.bold}${'═'.repeat(50)}${c.reset}`);
  console.log('');
}

/**
 * Interactive Selection Menu - Arrow Key Navigation
 * @param {string} title - Menu title
 * @param {Array<string|{label:string, value:any, disabled:boolean}>} items - Array of items to select from
 * @param {Object} options - Options { defaultIndex: 0 }
 * @returns {Promise<any>} Selected item value
 */
function selectFromList(title, items, options = {}) {
  const readline = require('readline');
  const { defaultIndex = 0 } = options;

  // Normalize items to { label, value, disabled }
  const normalizedItems = items.map((item, index) => {
    if (typeof item === 'string') {
      return { label: item, value: item, disabled: false };
    }
    return { label: item.label || item.value, value: item.value, disabled: item.disabled || false };
  });

  let selectedIndex = defaultIndex;

  function render() {
    console.clear();
    if (title) {
      console.log(`${c.bold}${c.brightCyan}${title}${c.reset}`);
      console.log(`${c.dim}Use Up/Down to navigate, Enter to select${c.reset}`);
      console.log('');
    }

    normalizedItems.forEach((item, index) => {

      const isSelected = index === selectedIndex;
      const isDisabled = item.disabled;

      if (isDisabled) {
        console.log(`  ${c.dim}${item.label}${c.reset}`);
      } else if (isSelected) {
        console.log(`  ${c.cyan}${icons.arrow}${c.reset} ${c.inverse}${c.bold} ${item.label} ${c.reset}`);
      } else {
        console.log(`    ${item.label}`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    // Ensure stdin is in proper state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const handleKey = (str, key) => {
      if (key.name === 'c' && key.ctrl) {
        process.stdin.setRawMode(false);
        process.exit();
      }

      if (key.name === 'up') {
        do {
          selectedIndex = (selectedIndex - 1 + normalizedItems.length) % normalizedItems.length;
        } while (normalizedItems[selectedIndex].disabled);
        render();
      } else if (key.name === 'down') {
        do {
          selectedIndex = (selectedIndex + 1) % normalizedItems.length;
        } while (normalizedItems[selectedIndex].disabled);
        render();
      } else if (key.name === 'return') {
        process.stdin.removeListener('keypress', handleKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        console.log(''); // Add newline after selection
        resolve(normalizedItems[selectedIndex].value);
      } else if (key.name === 'escape') {
        process.stdin.removeListener('keypress', handleKey);
        process.stdin.setRawMode(false);
        reject(new Error('Selection cancelled'));
      }
    };

    process.stdin.on('keypress', handleKey);
    render();
  });
}

/**
 * Yes/No Confirmation Dialog
 * @param {string} question - Question to ask
 * @param {boolean} defaultYes - Default to Yes (true) or No (false)
 * @returns {Promise<boolean>}
 */
function confirmAction(question, defaultYes = false) {
  const options = [
    { label: 'Yes', value: true },
    { label: 'No', value: false }
  ];
  return selectFromList(question, options, { defaultIndex: defaultYes ? 0 : 1 });
}

/**
 * Multi-Select Checkbox Menu
 * @param {string} title - Menu title
 * @param {Array<string|{label:string, value:any, checked:boolean}>} items
 * @returns {Promise<Array>} Array of selected values
 */
function multiSelect(title, items) {
  const readline = require('readline');

  // Normalize items
  const normalizedItems = items.map((item, index) => {
    if (typeof item === 'string') {
      return { label: item, value: item, checked: false };
    }
    return {
      label: item.label || item.value,
      value: item.value,
      checked: item.checked || false
    };
  });

  let selectedIndex = 0;

  function render() {
    console.clear();
    if (title) {
      console.log(`${c.bold}${c.brightCyan}${title}${c.reset}`);
      console.log(`${c.dim}Use Up/Down to navigate, Space to toggle, Enter to confirm${c.reset}`);
      console.log('');
    }

    normalizedItems.forEach((item, index) => {
      const isSelected = index === selectedIndex;
      const checkbox = item.checked ? `${c.green}${icons.checkmark}${c.reset}` : `${c.dim}☐${c.reset}`;

      if (isSelected) {
        console.log(`  ${c.cyan}${icons.arrow}${c.reset} ${checkbox} ${c.inverse} ${item.label} ${c.reset}`);
      } else {
        console.log(`    ${checkbox} ${item.label}`);
      }
    });
  }

  return new Promise((resolve, reject) => {
    // Ensure stdin is in proper state
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    const handleKey = (str, key) => {
      if (key.name === 'c' && key.ctrl) {
        process.stdin.setRawMode(false);
        process.exit();
      }

      if (key.name === 'up') {
        selectedIndex = (selectedIndex - 1 + normalizedItems.length) % normalizedItems.length;
        render();
      } else if (key.name === 'down') {
        selectedIndex = (selectedIndex + 1) % normalizedItems.length;
        render();
      } else if (key.name === 'space') {
        normalizedItems[selectedIndex].checked = !normalizedItems[selectedIndex].checked;
        render();
      } else if (key.name === 'return') {
        process.stdin.removeListener('keypress', handleKey);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        const selected = normalizedItems.filter(item => item.checked).map(item => item.value);
        console.log(''); // Add newline
        resolve(selected);
      } else if (key.name === 'escape') {
        process.stdin.removeListener('keypress', handleKey);
        process.stdin.setRawMode(false);
        reject(new Error('Selection cancelled'));
      }
    };

    process.stdin.on('keypress', handleKey);
    render();
  });
}


module.exports = {
  c,
  icons,
  header,
  warningHeader,
  success,
  error,
  warning,
  info,
  step,
  subStep,
  divider,
  section,
  box,
  summaryBox,
  tip,
  nextSteps,
  command,
  tableRow,
  tableHeader,
  clear,
  complete,
  fail,
  getWidth,
  selectFromList,
  confirmAction,
  multiSelect,
};
