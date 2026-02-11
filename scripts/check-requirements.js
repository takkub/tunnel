const { execSync } = require('child_process');
const ui = require('./ui-helper');

function checkCommand(command, name) {
  try {
    execSync(`${command} --version`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

ui.header('System Requirements', 'Checking installed dependencies...');

// Check requirements
const requirements = [
  { command: 'cloudflared', name: 'Cloudflared', required: false },
  { command: 'docker', name: 'Docker', required: true },
  { command: 'docker-compose', name: 'Docker Compose', required: false }
];

console.log('');
let allGood = true;
let hasCloudflared = false;
let hasDocker = false;

requirements.forEach(req => {
  const installed = checkCommand(req.command, req.name);

  if (req.command === 'cloudflared') hasCloudflared = installed;
  if (req.command === 'docker') hasDocker = installed;

  if (installed) {
    console.log(`  ${ui.c.green}${ui.icons.check}${ui.c.reset} ${ui.c.bold}${req.name}${ui.c.reset} ${ui.c.green}installed${ui.c.reset}`);
  } else {
    const color = req.required ? ui.c.red : ui.c.yellow;
    const icon = req.required ? ui.icons.cross : ui.icons.warning;
    console.log(`  ${color}${icon}${ui.c.reset} ${ui.c.bold}${req.name}${ui.c.reset} ${color}not installed${ui.c.reset}`);
    if (req.required) allGood = false;
  }
});

console.log('');
ui.divider();
console.log('');

if (!hasCloudflared && !hasDocker) {
  ui.fail('You need either Cloudflared OR Docker to continue.');
  console.log('');

  ui.section(`${ui.icons.package} Installation Options`);
  console.log('');

  console.log(`  ${ui.c.bold}${ui.c.cyan}Option 1 - Install Cloudflared:${ui.c.reset}`);
  console.log('');
  console.log(`  ${ui.c.dim}Windows (using winget):${ui.c.reset}`);
  ui.command('winget install Cloudflare.cloudflared');
  console.log('');
  console.log(`  ${ui.c.dim}Or download from:${ui.c.reset}`);
  console.log(`  ${ui.c.blue}https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/${ui.c.reset}`);
  console.log('');

  console.log(`  ${ui.c.bold}${ui.c.cyan}Option 2 - Install Docker (Recommended):${ui.c.reset}`);
  console.log('');
  console.log(`  ${ui.c.dim}Download Docker Desktop from:${ui.c.reset}`);
  console.log(`  ${ui.c.blue}https://www.docker.com/products/docker-desktop/${ui.c.reset}`);
  console.log('');

  ui.warning('Please install one of the above options first.');
  console.log('');

} else if (!hasCloudflared && hasDocker) {
  ui.success("Cloudflared is not installed, but that's OK!");
  console.log('');
  ui.info('You have Docker, which can run cloudflared commands.');
  console.log(`  ${ui.c.dim}All scripts will use Docker automatically.${ui.c.reset}`);
  console.log('');
  ui.divider();
  console.log('');

  ui.complete("You're ready to go!");

  ui.nextSteps([
    `Login to Cloudflare: ${ui.c.cyan}npm run login${ui.c.reset}`,
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`,
    `Start tunnels: ${ui.c.cyan}npm start${ui.c.reset}`
  ]);

  ui.tip(`Optional: Install cloudflared for faster commands: ${ui.c.cyan}winget install Cloudflare.cloudflared${ui.c.reset}`);
  console.log('');

} else if (hasCloudflared && !hasDocker) {
  ui.warning('Docker is required to run tunnels in containers.');
  console.log('');

  ui.section(`${ui.icons.docker} Install Docker`);
  console.log('');
  console.log(`  ${ui.c.dim}Download Docker Desktop from:${ui.c.reset}`);
  console.log(`  ${ui.c.blue}https://www.docker.com/products/docker-desktop/${ui.c.reset}`);
  console.log('');

  ui.warning('Please install Docker to continue.');
  console.log('');

} else if (hasCloudflared && hasDocker) {
  ui.complete('All requirements are met!');

  ui.nextSteps([
    `Login to Cloudflare: ${ui.c.cyan}npm run login${ui.c.reset}`,
    `Create a new tunnel: ${ui.c.cyan}npm run setup${ui.c.reset}`,
    `Start tunnels: ${ui.c.cyan}npm start${ui.c.reset}`
  ]);
}
