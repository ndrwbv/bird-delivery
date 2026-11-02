/* Packaging allowance for software-GPU CI. The ordinary early benchmark stays unchanged. */
function admissionSettings(mode='early'){
 if(!['early','settled'].includes(mode))throw Error('Invalid startup admission mode');
 return Object.freeze(mode==='early'
  ? {mode,early:true,bootWaitSec:360,controlWaitMs:240000,probeTimeoutSec:480,hardTimeoutMs:520000,movementWaitMs:600}
  : {mode,early:false,bootWaitSec:1200,controlWaitMs:420000,probeTimeoutSec:1740,hardTimeoutMs:1800000,movementWaitMs:30000});
}
// A real browser emulation override, only for packaging admission. Never spoof JS getters.
function admissionViewportMetrics(mode,width,height){
 if(!['early','settled'].includes(mode))throw Error('Invalid startup admission mode');
 if(mode!=='settled')return null;
 if(![width,height].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=8192)||width*height>33554432)throw Error('Invalid admission viewport size');
 return {width,height,deviceScaleFactor:1,mobile:false,screenWidth:width,screenHeight:height};
}
function checkedAdmissionViewport(metrics,actual,nativeContentSize){
 if(!metrics||actual?.width!==metrics.width||actual?.height!==metrics.height||actual?.devicePixelRatio!==1)throw Error('Admission viewport override did not produce requested CSS size/DPR');
 if(!Array.isArray(nativeContentSize)||nativeContentSize.length!==2||!nativeContentSize.every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid native content size');
 return {method:'CDP.Emulation.setDeviceMetricsOverride',requested:{width:metrics.width,height:metrics.height,devicePixelRatio:1},actual:{width:actual.width,height:actual.height,devicePixelRatio:actual.devicePixelRatio},nativeContentSize:{width:nativeContentSize[0],height:nativeContentSize[1]}};
}
module.exports={admissionSettings,admissionViewportMetrics,checkedAdmissionViewport};
