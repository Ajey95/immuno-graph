<p align="center">
  <img src="https://github.com/user-attachments/assets/b9c15223-786f-4448-bbdd-64f2b760b78f" alt="ImmunoGraph NitroStack MCP" width="100%">
</p>

# 🧬 ImmunoGraph NitroStack MCP

> **A domain-specific MCP server for reliable vaccine epitope prioritisation.**

The **ImmunoGraph NitroStack MCP** is a standalone **NitroStack CLI** application that exposes scientific capabilities through the **Model Context Protocol (MCP)**. It provides explainable, evidence-backed immunoinformatics analysis for AI agents instead of allowing them to directly interact with multiple scientific tools.

Unlike traditional AI pipelines where agents are tightly coupled with external APIs, ImmunoGraph separates **reasoning** from **scientific execution**.

- 🧠 Agents decide **what** needs to be analysed.
- 🔬 The MCP server knows **how** to perform the scientific analysis.
- 📊 Every prediction is accompanied by structured evidence and provenance.

---

# 🚀 Features

- ✅ FASTA sequence validation
- 🧬 Peptide generation
- 🦠 MHC-I epitope prediction
- 🧫 MHC-II epitope prediction
- 🛡️ B-cell epitope prediction
- 🌍 Population coverage analysis
- 📚 Evidence collection
- 📈 Candidate ranking
- 🔍 Scientific provenance
- 📦 MCP-native architecture
- ☁️ NitroCloud deployment ready

---

# 🏗 Architecture

```text
                    Researcher
                         │
                         ▼
                Supervisor Agent
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
 Immunology MCP     Structure MCP    Chemistry MCP
        │                │                │
        └────────────────┼────────────────┘
                         ▼
              Evidence & Governance MCP
                         │
                         ▼
                  Final Research Package
```

---

# 🧠 Why MCP?

Instead of allowing AI agents to directly call multiple scientific tools, ImmunoGraph exposes specialised scientific capabilities through MCP.

```text
Agent
   │
   ▼
ImmunoGraph MCP
   │
   ├── Sequence Validation
   ├── Epitope Prediction
   ├── Evidence Collection
   ├── Ranking
   └── Scientific Reports
```

This architecture provides:

- Modular design
- Reusable scientific services
- Explainable outputs
- Easier validation
- Better maintainability
- Reduced coupling between agents and scientific tools

---

# 🔬 Scientific Workflow

```text
Protein FASTA
      │
      ▼
Sequence Validation
      │
      ▼
Peptide Generation
      │
      ▼
Epitope Prediction
      │
      ▼
Population Coverage
      │
      ▼
Evidence Collection
      │
      ▼
Candidate Ranking
      │
      ▼
Structured Research Output
```

---

# 📂 Project Structure

```text
src/
│
├── index.ts
├── app.module.ts
│
├── modules/
│   ├── prediction/
│   ├── evidence/
│   ├── constraint/
│   ├── structure/
│   ├── chemistry/
│   ├── docking/
│   └── report/
│
├── widgets/
│
└── lib/
    ├── algorithms/
    └── database/

data/

nitrostack.config.ts
```

The project follows the standard **NitroStack CLI** structure with feature-based modules for prediction, evidence, structural analysis, chemistry, docking and reporting.

---

# ⚙️ Installation

```bash
npm install
```

---

# ▶️ Development

```bash
npm run dev
```

---

# 🏗 Build

```bash
npm run build
```

---

# 🚀 Start

```bash
npm start
```

The project uses the NitroStack CLI internally.

| Command | Description |
|----------|-------------|
| `npm run dev` | Starts development server |
| `npm run build` | Builds the project |
| `npm start` | Builds and starts production server |

---

# ☁️ Deploy to NitroCloud

Use this folder as the deployment root.

### Build

```bash
npm run build
```

### Production

```bash
npm run start:prod
```

The NitroStack CLI automatically injects the required `PORT`.

For OAuth deployments configure:

```env
RESOURCE_URI=https://your-public-url
```

Keep

```env
OAUTH_REQUIRED=false
```

unless authentication endpoints are configured.

---

# 📦 Scientific Capabilities

## 🧬 Immunology

- FASTA validation
- Peptide generation
- MHC-I prediction
- MHC-II prediction
- B-cell prediction
- Population coverage
- Consensus scoring

---

## 🧱 Structural Biology

- Protein structure retrieval
- AlphaFold support
- PDB support
- Surface accessibility
- Confidence analysis
- Epitope mapping

---

## ⚗️ Chemistry & Docking

- Ligand preparation
- Protein preparation
- Molecular docking
- Interaction analysis
- Binding evaluation

---

## 📚 Evidence & Governance

- Provenance tracking
- Evidence graph
- Candidate ranking
- Audit trail
- Report generation

---

# 🎯 Design Principles

- Single Responsibility Principle
- Explainable AI
- Modular MCP Architecture
- Scientific Reproducibility
- Evidence-backed Decision Support
- Human-in-the-loop Research

---

# 🛠 Technology Stack

- NitroStack CLI
- TypeScript
- Node.js
- Model Context Protocol (MCP)
- NitroCloud

---

# 📄 License

This project is intended for research and educational purposes.
