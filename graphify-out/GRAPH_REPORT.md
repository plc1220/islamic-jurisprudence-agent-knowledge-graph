# Graph Report - .  (2026-06-16)

## Corpus Check
- 12 files · ~18,018 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 92 nodes · 161 edges · 16 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `isGcpNativeConfigured()` - 11 edges
2. `writeRowsToBigQuery()` - 8 edges
3. `publishToKnowledgeCatalog()` - 8 edges
4. `ingestDocumentContent()` - 8 edges
5. `bqTableRef()` - 7 edges
6. `ensureBigQueryKnowledgeStore()` - 7 edges
7. `persistGcpNativeKnowledge()` - 7 edges
8. `build_document()` - 7 edges
9. `runBigQuery()` - 6 edges
10. `searchBigQueryVectorChunks()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `getStorageClient()` --calls--> `isGcpNativeConfigured()`  [EXTRACTED]
  server.ts → server.ts  _Bridges community 2 → community 3_
- `bqTableRef()` --calls--> `isValidBqIdentifier()`  [EXTRACTED]
  server.ts → server.ts  _Bridges community 0 → community 2_
- `documentIdFor()` --calls--> `slugify()`  [EXTRACTED]
  server.ts → server.ts  _Bridges community 3 → community 5_
- `persistGcpNativeKnowledge()` --calls--> `documentIdFor()`  [EXTRACTED]
  server.ts → server.ts  _Bridges community 5 → community 9_
- `publishToKnowledgeCatalog()` --calls--> `truncateText()`  [EXTRACTED]
  server.ts → server.ts  _Bridges community 0 → community 3_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.16
Nodes (7): assertBqIdentifiers(), bqDatasetRef(), buildGraphRows(), chunkCitation(), isValidBqIdentifier(), safeJson(), truncateText()

### Community 1 - "Community 1"
Cohesion: 0.32
Nodes (12): build_document(), compact_markdown(), crawl(), emit(), is_probably_article(), main(), markdown_from_result(), normalize_url() (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.51
Nodes (10): bqTableRef(), ensureBigQueryKnowledgeStore(), getBigQueryClient(), getFullGraphFromBigQuery(), isGcpNativeConfigured(), resetBigQueryGraph(), runBigQuery(), searchBigQueryGraphTriples() (+2 more)

### Community 3 - "Community 3"
Cohesion: 0.28
Nodes (9): catalogFqn(), createOrPatchCatalogEntry(), dataplexRequest(), ensureKnowledgeCatalogScaffold(), getGoogleAuth(), getStorageClient(), publishToKnowledgeCatalog(), slugify() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.22
Nodes (0): 

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (7): chunkText(), documentIdFor(), generateTextEmbedding(), getEmbeddingModelName(), hashId(), ingestDocumentContent(), mergeGraphIntoMemory()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (6): crawlDocumentsForIngestion(), extractCleanContent(), getSourceMaxPages(), ingestURLContent(), runCrawl4AiBridge(), summarizePipelineStatus()

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (0): 

### Community 8 - "Community 8"
Cohesion: 0.67
Nodes (2): fetchCrawlLogs(), handleBatchCrawl()

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (3): exportMetadataAsCode(), persistGcpNativeKnowledge(), yamlString()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (0): 

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 11`** (2 nodes): `handleExport()`, `ArchitectureExplainer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `SourceCard()`, `SourceCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (1 nodes): `data.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isGcpNativeConfigured()` connect `Community 2` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `publishToKnowledgeCatalog()` connect `Community 3` to `Community 0`, `Community 9`, `Community 2`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `ingestDocumentContent()` connect `Community 5` to `Community 0`, `Community 9`, `Community 6`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._