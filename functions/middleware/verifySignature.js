// middleware/verifySignature.js
const crypto = require('crypto');
const APP_SECRET = process.env.APP_SECRET;

module.exports = function verifyRequestSignature(req, res, next) {
  if (!APP_SECRET) {
    console.warn('⚠️ APP_SECRET no configurado, no se valida la firma.');
    return next();
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return res.sendStatus(403);

  const [algo, signatureHash] = signature.split('=');
  const expectedHash = crypto.createHmac('sha256', APP_SECRET).update(req.rawBody).digest('hex');

  if (signatureHash !== expectedHash) return res.sendStatus(403);
  next();
};
