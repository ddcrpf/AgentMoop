import { clerkSetup } from '@clerk/testing/playwright';
import { createClerkClient } from '@clerk/backend';
export default async function globalSetup(){
  await clerkSetup();
  const clerk=createClerkClient({secretKey:process.env.CLERK_SECRET_KEY!});
  for(const name of ['e2e_alice','e2e_bob']){
    const email=`${name}+clerk_test@example.com`;
    const found=await clerk.users.getUserList({emailAddress:[email]});
    if(!found.data.length)await clerk.users.createUser({emailAddress:[email],skipPasswordRequirement:true});
  }
}
