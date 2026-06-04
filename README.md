# Mermaid Editable Export

Convertisseur `Mermaid -> objets éditables` avec un coeur sémantique indépendant du format de sortie.

## Objectifs

- Preserver la semantique des diagrammes Mermaid
- Conserver les groupes logiques comme groupes editables
- Garantir qu'un meme concept reutilise un meme style
- Exporter vers des formats de presentation editables (`.pptx`, puis `.odp`)

## Architecture

```text
Mermaid source
  -> parse/extract
  -> semantic IR
  -> layout normalization
  -> style resolution
  -> backend export
```

## Etat actuel

Ce scaffold pose:

- l'IR semantique
- les contrats de backend
- un pipeline minimal
- un CLI de demonstration
- un petit corpus d'exemples Mermaid dans `examples/`

Le parseur Mermaid reel reste a enrichir, et l'export ODP reste a brancher.

## Demarrage

```bash
npm install
npm run check
npm run test
```

Exemple:

```bash
npm run dev -- C:\\DEV\\scw-projects.mermaid
```

Export PPTX:

```bash
npm run dev -- C:\\DEV\\scw-projects.mermaid pptx
```
