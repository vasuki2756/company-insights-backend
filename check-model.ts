import ollama from "ollama";
const r = await ollama.list();
console.log(JSON.stringify(r.models.map(m => ({ name: m.name })), null, 2));
