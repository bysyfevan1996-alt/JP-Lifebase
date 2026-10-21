import net from 'node:net';
import {randomInt} from 'node:crypto';

// The OS may allocate an ephemeral port that Fetch deliberately refuses (for example 6000).
// Test listeners use an available high port instead of changing Fetch's security settings.
export async function testPort(){
 for(let i=0;i<30;i++){
  const port=randomInt(30000,65000),probe=net.createServer();
  const available=await new Promise(resolve=>{probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>resolve(true));});
  if(available){await new Promise(resolve=>probe.close(resolve));return String(port);}
 }
 throw new Error('No local test port available');
}
