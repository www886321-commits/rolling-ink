import { render, vectorize } from './engine.js';
self.onmessage = ({ data }) => {
  const { id, type, pixels, width, height, config } = data;
  const preview=type==='preview'||type==='detail';
  try {
    const result = render(new Uint8ClampedArray(pixels), width, height, config, fraction => {
      if (!preview) self.postMessage({ id, progress:fraction * (type === 'svg' ? .45 : 1), phase:'render' });
    });
    if (type === 'svg') {
      const svg = vectorize(result.pixels, width, height, config, data.outputW, data.outputH, data.detail, fraction => self.postMessage({ id, progress:.45 + fraction * .55, phase:'vector' }));
      self.postMessage({ id, svg });
    } else {
      self.postMessage({ id, pixels:result.pixels.buffer, original:preview ? result.original.buffer : null, width:result.width, height:result.height }, preview ? [result.pixels.buffer, result.original.buffer] : [result.pixels.buffer]);
    }
  } catch (error) { self.postMessage({ id, error:error.message || '处理失败' }); }
};
