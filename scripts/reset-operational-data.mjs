import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'node:fs/promises';

const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT;
let scope = process.argv[2] || '';

if (!scope) {
  const command = JSON.parse(await readFile('.github/reset-command.json', 'utf8'));
  if (command.command !== 'ZERAR') {
    console.log('Nenhuma limpeza solicitada.');
    process.exit(0);
  }
  scope = command.scope || 'presencas';
}

if (!['presencas', 'todos'].includes(scope)) {
  throw new Error('Escopo de limpeza inválido.');
}

if (!rawCredential) {
  throw new Error('O segredo FIREBASE_SERVICE_ACCOUNT não foi configurado.');
}

const serviceAccount = JSON.parse(rawCredential);
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const collections = scope === 'todos'
  ? ['presencas', 'movimentacoes', 'alertas']
  : ['presencas'];

async function clearCollection(name) {
  let removed = 0;

  while (true) {
    const snapshot = await db.collection(name).limit(400).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    removed += snapshot.size;
  }

  console.log(`${name}: ${removed} registro(s) removido(s)`);
  return removed;
}

let total = 0;
for (const name of collections) total += await clearCollection(name);

console.log(`Limpeza concluída. Total removido: ${total}`);
