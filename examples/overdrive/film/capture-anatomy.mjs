import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const upstream = process.argv[2];
if (!upstream) throw new Error('Pass a checkout of wheresryan22/anatomy');
const output = resolve(import.meta.dirname, '../../..', 'artifacts/overdrive/anatomy-frames');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:600,height:380},deviceScaleFactor:2});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install();
await page.clock.pauseAt(new Date());
await page.goto('file://' + resolve(upstream,'examples/dial-indicator/dial-indicator-light.html'));
await page.addStyleTag({content: 'html,body,main,.iso-plate,.iso-stage{margin:0!important;padding:0!important;width:600px!important;max-width:none!important;border:0!important;outline:none!important;box-shadow:none!important;border-radius:0!important;background:#fff!important}.iso-stage{height:380px!important}.iso-stage svg{width:600px!important;height:380px!important}.iso-plate-corners,.iso-plate>header,.iso-plate>footer,.iso-caption,.iso-keys{display:none!important}[data-tone="lit"]{stroke:#e56a35!important}.iso-halo{opacity:.18!important}'});
const stage=page.locator('.iso-stage');
await stage.scrollIntoViewIfNeeded();
await stage.focus();
await page.keyboard.press("End");
await page.clock.runFor(1000);
for(let i=0;i<450;i++){
 if(i===99)await page.keyboard.press("Home");
 if(i===240)await page.keyboard.press("ArrowLeft");
 if(i===330)await page.keyboard.press("ArrowLeft");
 await page.clock.runFor(1000/30);
 await stage.screenshot({path:resolve(output,String(i).padStart(4,'0')+'.png'),animations:'allow'});
 if(i%90===0)console.log('frame',i);
}
await writeFile(resolve(output,'capture.json'),JSON.stringify({frames:450,fps:30,source:'https://github.com/wheresryan22/anatomy/tree/main/examples/dial-indicator',errors},null,2));
await browser.close();
