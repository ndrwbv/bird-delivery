/* Packaging allowance for software-GPU CI. The ordinary early benchmark stays unchanged. */
function admissionSettings(mode='early'){
 if(!['early','settled'].includes(mode))throw Error('Invalid startup admission mode');
 return Object.freeze(mode==='early'
  ? {mode,early:true,bootWaitSec:360,controlWaitMs:240000,probeTimeoutSec:480,hardTimeoutMs:520000,movementWaitMs:600}
  : {mode,early:false,bootWaitSec:1200,controlWaitMs:420000,probeTimeoutSec:1740,hardTimeoutMs:1800000,movementWaitMs:30000});
}
module.exports={admissionSettings};
