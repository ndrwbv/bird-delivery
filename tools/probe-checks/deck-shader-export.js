if (!await until(() => {
  const dialog = document.querySelector('#dlg:not([hidden])');
  if (dialog) (dialog.querySelector('.dlg-yes') || dialog.querySelector('button'))?.click();
  return !!window.__startupTrace?.firstControl;
}, 180000)) throw Error('Не появился управляемый кадр для подготовки шейдеров');

const gl = d.renderer.getContext();
const graphics = d.GFX.preset, programCount = window.__deckShaderCapture.count();
if (graphics !== 'high' || d.GFX.dev !== 'deck' || programCount <= 0 || programCount > 512) {
  throw Error('Нужна высокая графика Deck и допустимое число программ');
}
const bad = d.renderer.info.programs.filter(row => row.program && !gl.getProgramParameter(row.program, gl.LINK_STATUS));
if (bad.length) throw Error('Ошибки компоновки шейдеров: ' + bad.length);
const bytes = await window.__deckShaderCapture.prepare(gl.getContextAttributes());
return { captureDeckShaders: true, graphics, programCount, bytes };
