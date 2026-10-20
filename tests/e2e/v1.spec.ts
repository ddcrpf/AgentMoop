import { test, expect, type Browser, type Page } from '@playwright/test';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
async function member(browser:Browser,name:string):Promise<Page>{
  const page=await (await browser.newContext()).newPage();
  await setupClerkTestingToken({page});await page.goto('/sign-in');
  await clerk.signIn({page,signInParams:{strategy:'email_code',identifier:`${name}+clerk_test@example.com`}});
  await page.goto('/app');
  const tag=page.getByLabel('Moop tag',{exact:true});
  await expect(tag.or(page.getByText('Your moop tag',{exact:true}))).toBeVisible();
  if(await tag.isVisible()){await tag.fill(name);await page.getByRole('button',{name:'Claim tag'}).click();}
  await expect(page.getByText(`@${name}`)).toBeVisible();return page;
}
test('two people connect by tag, chat live, and HTML stays text',async({browser})=>{
  const alice=await member(browser,'e2e_alice'),bob=await member(browser,'e2e_bob');
  await alice.getByRole('radio',{name:'Dark'}).check();
  await expect(alice.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(alice.locator('.backdrop')).toHaveCount(0);
  await alice.screenshot({path:'/private/tmp/agentmoop-home-dark.png',fullPage:true});
  await alice.reload();
  await expect(alice.getByRole('radio',{name:'Dark'})).toBeChecked();
  await alice.getByRole('radio',{name:'Light'}).check();
  await expect(alice.locator('html')).toHaveAttribute('data-theme','light');
  await alice.screenshot({path:'/private/tmp/agentmoop-home-light.png',fullPage:true});
  await expect(alice.getByRole('heading',{name:'Connect your tools'})).toBeVisible();
  await expect(alice.getByRole('heading',{name:'Get set up'})).toHaveCount(0);
  await alice.getByLabel("Friend's moop tag",{exact:true}).fill('@E2E_Bob');await alice.getByRole('button',{name:'Send request'}).click();
  await expect(alice.getByRole('status')).toHaveText(/Request sent|You are now friends/);
  const accept=bob.getByRole('button',{name:'Accept'});
  if(await accept.isVisible({timeout:5000}).catch(()=>false))await accept.click();
  await bob.goto('/inbox');await alice.goto('/inbox');
  await bob.getByText('@e2e_alice').click();
  await alice.getByText('@e2e_bob').click();
  await alice.locator('.cs-message-input__content-editor').fill('<img src=x onerror=window.pwned=1> hello');await alice.keyboard.press('Enter');
  await expect(bob.locator('.cs-message__custom-content').getByText('<img src=x onerror=window.pwned=1> hello')).toBeVisible({timeout:5000});
  expect(await bob.evaluate(()=>(window as unknown as {pwned?:number}).pwned)).toBeUndefined();
  await expect(alice.getByRole('heading',{name:'Connect your tools'})).toHaveCount(0);
});
