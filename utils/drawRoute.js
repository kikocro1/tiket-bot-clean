const { createCanvas, loadImage } = require('canvas');
const path = require('path');

/**
 * track = [{ x, z, time }]
 */
async function drawRoute(track) {
  const mapPath = path.join(
    __dirname,
    '../public/maps/luwov_map.png'
  );

  const mapImg = await loadImage(mapPath);
  const canvas = createCanvas(mapImg.width, mapImg.height);
  const ctx = canvas.getContext('2d');

  // background
  ctx.drawImage(mapImg, 0, 0);

  if (track.length < 2) {
    return canvas.toBuffer();
  }

  // ⚠️ privremene granice (kalibrirat ćemo kasnije)
  const WORLD = {
    minX: -2048,
    maxX: 2048,
    minZ: -2048,
    maxZ: 2048,
  };

  const toMapX = (x) =>
    ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * canvas.width;

  const toMapZ = (z) =>
    ((z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)) * canvas.height;

  // route
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 3;
  ctx.beginPath();

  track.forEach((p, i) => {
    const mx = toMapX(p.x);
    const mz = toMapZ(p.z);
    if (i === 0) ctx.moveTo(mx, mz);
    else ctx.lineTo(mx, mz);
  });

  ctx.stroke();

  // start
  ctx.fillStyle = '#00ff00';
  ctx.beginPath();
  ctx.arc(
    toMapX(track[0].x),
    toMapZ(track[0].z),
    5,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // end
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(
    toMapX(track[track.length - 1].x),
    toMapZ(track[track.length - 1].z),
    5,
    0,
    Math.PI * 2
  );
  ctx.fill();

  return canvas.toBuffer();
}

module.exports = { drawRoute };

