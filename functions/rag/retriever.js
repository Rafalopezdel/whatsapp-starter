// rag/retriever.js
const fs = require('fs');
const path = require('path');

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge.json'), 'utf8'));

// Recuperador mínimo por clave + fallback básico
async function retrieveByKey(key) {
  return DATA[key];
}

// Hook para RAG futuro (embeddings)
// Aquí podrás indexar PDFs/MDs y buscar por similitud usando pgvector/Pinecone/etc.
async function retrieveByQuery(query) {
  // Placeholder: heurística muy simple
  query = (query || '').toLowerCase();
  if (query.includes('carilla')) return DATA['info_carillas'];
  if (query.includes('blanq')) return DATA['info_blanqueamiento'];
  if (query.includes('invisible') || query.includes('alineador')) return DATA['info_ortodoncia_invisible'];
  if (query.includes('diseño') || query.includes('sonrisa')) return DATA['info_diseno'];
  if (query.includes('precio') || query.includes('costo')) return DATA['info_precios'];
  return null; // Deja que Claude lo maneje con tu prompt y contexto.
}

module.exports = { retrieveByKey, retrieveByQuery };