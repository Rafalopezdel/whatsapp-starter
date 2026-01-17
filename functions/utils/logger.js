// utils/logger.js
module.exports = function logger(title, obj) {
  console.log(`📩 ${title}:`, JSON.stringify(obj, null, 2));
};
