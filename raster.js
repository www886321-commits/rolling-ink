// Read original pixels in strips instead of allocating a full RGBA scan canvas.
// A 5400 x 7600 scan still produces its complete 41 MB ink map, without two
// additional 164 MB full-sized RGBA buffers during decoding.
export function inkMapFromImage(image, crop) {
  const { left, top, width, height } = crop;
  const stripeHeight = Math.min(128, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = stripeHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y += stripeHeight) {
    const rows = Math.min(stripeHeight, height - y);
    context.clearRect(0, 0, width, stripeHeight);
    context.drawImage(image, left, top + y, width, rows, 0, 0, width, rows);
    const rgba = context.getImageData(0, 0, width, rows).data;
    const offset = y * width;
    for (let i = 0; i < width * rows; i++) data[offset + i] = 255 - rgba[i * 4];
  }
  canvas.width = canvas.height = 0;
  const lowCanvas = document.createElement('canvas');
  lowCanvas.width = 48;
  lowCanvas.height = Math.round(48 * height / width);
  const lowContext = lowCanvas.getContext('2d', { willReadFrequently: true });
  lowContext.drawImage(image, left, top, width, height, 0, 0, lowCanvas.width, lowCanvas.height);
  const lowRGBA = lowContext.getImageData(0, 0, lowCanvas.width, lowCanvas.height).data;
  const lowData = new Uint8Array(lowCanvas.width * lowCanvas.height);
  for (let i = 0; i < lowData.length; i++) lowData[i] = 255 - lowRGBA[i * 4];
  const low = { width: lowCanvas.width, height: lowCanvas.height, data: lowData };
  lowCanvas.width = lowCanvas.height = 0;
  return { width, height, data, low };
}
