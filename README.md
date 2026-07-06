# Portal de Organograma — INC (teste React/Vercel)

Projeto **Next.js (App Router)** para testar o deploy de React na Vercel.
A página inicial mostra o organograma da área de **Tecnologia da Informação** com dados reais.

## Rodar localmente

```bash
npm install
npm run dev
```

Abrir http://localhost:3000

## Subir na Vercel

**Opção A — via GitHub (recomendado)**
1. Suba esta pasta (`portal_org_inc`) para um repositório no GitHub.
2. Em https://vercel.com → **Add New… → Project** → importe o repositório.
3. A Vercel detecta Next.js automaticamente. Clique em **Deploy** (sem configurar nada).

**Opção B — via CLI**
```bash
npm i -g vercel
vercel        # segue o assistente
vercel --prod # publica em produção
```

Nenhuma variável de ambiente é necessária para este teste.

## Estrutura

```
portal_org_inc/
├─ app/
│  ├─ layout.js        # layout raiz + fonte (Plus Jakarta Sans)
│  ├─ page.js          # página inicial
│  └─ globals.css      # estilos
├─ components/
│  ├─ OrgChart.jsx     # organograma (client component)
│  └─ icons.jsx        # ícones SVG (linha fina, sem libs)
├─ data/
│  └─ ti.js            # dados reais da área de TI + regra de nível
├─ package.json
├─ next.config.mjs
└─ jsconfig.json       # alias @/
```

## Observações

- O `nivel` é derivado do cargo apenas para o teste. Em produção virá da tabela de níveis por cargo.
- A hierarquia é montada pelo campo `lider` de cada pessoa (troca de área = troca do dataset em `data/`).
