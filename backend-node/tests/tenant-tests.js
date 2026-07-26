const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = path.join(__dirname, '.tmp-tenant-data');
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

const { LocalStore } = require('../src/store');

const resource = {
  table: 'leads',
  companyScoped: true,
  defaultOrder: 'created_at.asc'
};

function ctx(profileId, empresaId, permissions) {
  return {
    empresaId,
    profile: { id: profileId },
    permissions: {
      tipo: 'usuario',
      can_write: true,
      admin: false,
      company_admin: false,
      super_admin: false,
      manager: false,
      ...permissions
    }
  };
}

async function main() {
  const store = new LocalStore();
  const data = store.read();
  const empresaA = data.empresas[0].id;
  const empresaB = '00000000-0000-4000-8000-000000000002';
  const userA = data.usuarios[0].id;
  const userB = '00000000-0000-4000-8000-000000000099';
  const ownLead = '00000000-0000-4000-8000-000000000301';
  const otherLead = '00000000-0000-4000-8000-000000000302';
  const tenantBLead = '00000000-0000-4000-8000-000000000303';

  data.empresas.push({ id: empresaB, nome: 'Empresa B', status: 'ativo' });
  data.usuarios.push({
    id: userB,
    empresa_id: empresaA,
    auth_user_id: 'other-auth-user',
    nome: 'Outro Usuario',
    email: 'outro@demo.local',
    status: 'ativo',
    tipo_usuario: 'usuario'
  });
  data.leads.push(
    { id: ownLead, empresa_id: empresaA, responsavel_id: userA, nome: 'Lead do usuario comum', created_at: '2026-01-01T00:00:00.000Z' },
    { id: otherLead, empresa_id: empresaA, responsavel_id: userB, nome: 'Lead de outro responsavel', created_at: '2026-01-02T00:00:00.000Z' },
    { id: tenantBLead, empresa_id: empresaB, responsavel_id: userB, nome: 'Lead de outra empresa', created_at: '2026-01-03T00:00:00.000Z' }
  );
  store.write(data);

  const regular = ctx(userA, empresaA);
  const admin = ctx(userA, empresaA, { tipo: 'administrador', admin: true, company_admin: true });
  const superAdmin = ctx(userA, empresaA, { tipo: 'super_admin', admin: true, super_admin: true });

  let rows = await store.list('leads', {}, regular, resource);
  assert.ok(rows.some(row => row.id === ownLead));
  assert.ok(!rows.some(row => row.id === otherLead));
  assert.ok(!rows.some(row => row.id === tenantBLead));

  await assert.rejects(() => store.get('leads', otherLead, regular, resource), /Registro fora do escopo/);
  await assert.rejects(() => store.update('leads', otherLead, { nome: 'Tentativa cruzada' }, regular, resource), /Registro fora do escopo/);
  await assert.rejects(() => store.remove('leads', otherLead, regular, resource), /Registro fora do escopo/);
  await assert.rejects(() => store.insert('leads', { nome: 'Lead atribuido indevidamente', responsavel_id: userB }, regular, resource), /outro responsavel/);

  const inserted = await store.insert('leads', { nome: 'Lead sem responsavel explicito' }, regular, resource);
  assert.strictEqual(inserted.empresa_id, empresaA);
  assert.strictEqual(inserted.responsavel_id, userA);

  await assert.rejects(() => store.update('leads', ownLead, { responsavel_id: userB }, regular, resource), /outro responsavel/);

  rows = await store.list('leads', {}, admin, resource);
  assert.ok(rows.some(row => row.id === ownLead));
  assert.ok(rows.some(row => row.id === otherLead));
  assert.ok(!rows.some(row => row.id === tenantBLead));

  rows = await store.list('leads', {}, superAdmin, resource);
  assert.ok(rows.some(row => row.id === ownLead));
  assert.ok(rows.some(row => row.id === otherLead));
  assert.ok(rows.some(row => row.id === tenantBLead));

  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  console.log('OK tenant isolation store enforcement');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
