# Graph Report - .  (2026-06-21)

## Corpus Check
- Corpus is ~24,703 words - fits in a single context window. You may not need a graph.

## Summary
- 164 nodes · 252 edges · 22 communities detected
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Chat Retrieval Core|Chat Retrieval Core]]
- [[_COMMUNITY_Graphify Viewer Outputs|Graphify Viewer Outputs]]
- [[_COMMUNITY_D3 Graph Layout|D3 Graph Layout]]
- [[_COMMUNITY_BigQuery Graph Store|BigQuery Graph Store]]
- [[_COMMUNITY_Crawl4AI Bridge|Crawl4AI Bridge]]
- [[_COMMUNITY_GCP Deployment Flow|GCP Deployment Flow]]
- [[_COMMUNITY_Knowledge Catalog Publishing|Knowledge Catalog Publishing]]
- [[_COMMUNITY_Crawler Panel UI|Crawler Panel UI]]
- [[_COMMUNITY_Document Ingestion|Document Ingestion]]
- [[_COMMUNITY_Session Persistence|Session Persistence]]
- [[_COMMUNITY_URL Crawl Pipeline|URL Crawl Pipeline]]
- [[_COMMUNITY_Relevant Graph Snippet|Relevant Graph Snippet]]
- [[_COMMUNITY_Chat Markdown Rendering|Chat Markdown Rendering]]
- [[_COMMUNITY_GCS Metadata Export|GCS Metadata Export]]
- [[_COMMUNITY_React App Shell|React App Shell]]
- [[_COMMUNITY_Vertex ADC Setup|Vertex ADC Setup]]
- [[_COMMUNITY_Architecture Explainer|Architecture Explainer]]
- [[_COMMUNITY_Source Cards|Source Cards]]
- [[_COMMUNITY_Vite Entry Point|Vite Entry Point]]
- [[_COMMUNITY_Vite Configuration|Vite Configuration]]
- [[_COMMUNITY_Seed Data|Seed Data]]
- [[_COMMUNITY_Shared Types|Shared Types]]

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
- `KnowledgeGraph React Component` --semantically_similar_to--> `Vis Network Graphify Viewer`  [INFERRED] [semantically similar]
  src/components/KnowledgeGraph.tsx → graphify-out/graph.html
- `BigQuery Vector Search Retrieval` --semantically_similar_to--> `God Nodes Core Abstractions`  [INFERRED] [semantically similar]
  doc/cicd.md → graphify-out/GRAPH_REPORT.md
- `God Nodes Core Abstractions` --conceptually_related_to--> `Runtime Knowledge Ingestion Flow`  [INFERRED]
  graphify-out/GRAPH_REPORT.md → doc/cicd.md
- `Crawl4AI Python Dependency` --conceptually_related_to--> `Crawl4AI Chromium Runtime`  [EXTRACTED]
  requirements-crawler.txt → doc/cicd.md
- `Rationale: ADC Replaces Gemini API Key` --rationale_for--> `Vertex AI ADC Environment Configuration`  [EXTRACTED]
  doc/cicd.md → README.md

## Hyperedges (group relationships)
- **Interactive Graph Rendering Pattern** — knowledgegraph_knowledge_graph_component, knowledgegraph_d3_force_layout, knowledgegraph_visual_state, knowledgegraph_fit_focus_zoom [EXTRACTED 1.00]
- **Graphify Viewer Data Inspection Flow** — graphhtml_vis_network_viewer, graphhtml_raw_nodes_edges, graphhtml_sidebar_inspection, graphhtml_community_legend_filter [EXTRACTED 1.00]
- **GCP Native Knowledge Platform Flow** — cicd_crawl4ai_runtime, cicd_cloud_run_runtime, cicd_bigquery_vector_search, cicd_knowledge_catalog, cicd_runtime_flow [EXTRACTED 1.00]

## Communities

### Community 0 - "Chat Retrieval Core"
Cohesion: 0.13
Nodes (4): getOrCreateSessionId(), isSecureRequest(), isValidSessionId(), parseCookieHeader()

### Community 1 - "Graphify Viewer Outputs"
Cohesion: 0.13
Nodes (17): Community Legend Filtering, Hyperedge Shaded Region Renderer, Embedded RAW_NODES and RAW_EDGES Data, Sidebar Search and Node Inspection, Vis Network Graphify Viewer, HTML Escape Helper, Graphify Community Hubs, Graphify Corpus Summary (+9 more)

### Community 2 - "D3 Graph Layout"
Cohesion: 0.15
Nodes (6): applyVisualState(), computeFitTransform(), fitToGraph(), getConnectedIds(), persistPositions(), rememberLayout()

### Community 3 - "BigQuery Graph Store"
Cohesion: 0.28
Nodes (15): assertBqIdentifiers(), bqDatasetRef(), bqTableRef(), buildGraphRows(), ensureBigQueryKnowledgeStore(), getBigQueryClient(), getFullGraphFromBigQuery(), isGcpNativeConfigured() (+7 more)

### Community 4 - "Crawl4AI Bridge"
Cohesion: 0.32
Nodes (12): build_document(), compact_markdown(), crawl(), emit(), is_probably_article(), main(), markdown_from_result(), normalize_url() (+4 more)

### Community 5 - "GCP Deployment Flow"
Cohesion: 0.24
Nodes (13): BigQuery Vector Search Retrieval, Cloud Build Legacy Manual Path, Cloud Run Runtime Configuration, Crawl4AI Chromium Runtime, GCP Native Deployment Architecture, GitHub Actions Cloud Run Deployment, Knowledge Catalog Governance, Rationale: Lazy BigQuery and Catalog Provisioning (+5 more)

### Community 6 - "Knowledge Catalog Publishing"
Cohesion: 0.28
Nodes (9): catalogFqn(), chunkCitation(), createOrPatchCatalogEntry(), dataplexRequest(), ensureKnowledgeCatalogScaffold(), getGoogleAuth(), publishToKnowledgeCatalog(), slugify() (+1 more)

### Community 7 - "Crawler Panel UI"
Cohesion: 0.32
Nodes (4): fetchCrawlLogs(), getPortalLog(), getPortalStatus(), handleBatchCrawl()

### Community 8 - "Document Ingestion"
Cohesion: 0.33
Nodes (7): chunkText(), documentIdFor(), generateTextEmbedding(), getEmbeddingModelName(), hashId(), ingestDocumentContent(), mergeGraphIntoMemory()

### Community 9 - "Session Persistence"
Cohesion: 0.33
Nodes (7): getConnectedRedisClient(), pruneExpiredMemorySessions(), readSessionState(), sanitizeChatMessages(), sanitizeSessionState(), sanitizeText(), writeSessionState()

### Community 10 - "URL Crawl Pipeline"
Cohesion: 0.33
Nodes (6): crawlDocumentsForIngestion(), extractCleanContent(), getSourceMaxPages(), ingestURLContent(), runCrawl4AiBridge(), summarizePipelineStatus()

### Community 11 - "Relevant Graph Snippet"
Cohesion: 0.33
Nodes (0): 

### Community 12 - "Chat Markdown Rendering"
Cohesion: 0.33
Nodes (0): 

### Community 13 - "GCS Metadata Export"
Cohesion: 0.4
Nodes (5): exportMetadataAsCode(), getStorageClient(), persistGcpNativeKnowledge(), uploadRawMarkdownToGCS(), yamlString()

### Community 14 - "React App Shell"
Cohesion: 0.4
Nodes (0): 

### Community 15 - "Vertex ADC Setup"
Cohesion: 0.5
Nodes (4): Rationale: ADC Replaces Gemini API Key, Google AI Studio App, Local Development Flow, Vertex AI ADC Environment Configuration

### Community 16 - "Architecture Explainer"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Source Cards"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Vite Entry Point"
Cohesion: 1.0
Nodes (2): React Root Mount Point, Vite Module Entry Script

### Community 19 - "Vite Configuration"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Seed Data"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Shared Types"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **13 isolated node(s):** `Fit Focus and Zoom Controls`, `Node Type Legend`, `React Root Mount Point`, `Vite Module Entry Script`, `Crawl4AI Python Dependency` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Architecture Explainer`** (2 nodes): `handleExport()`, `ArchitectureExplainer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Source Cards`** (2 nodes): `SourceCard()`, `SourceCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Entry Point`** (2 nodes): `React Root Mount Point`, `Vite Module Entry Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Configuration`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Seed Data`** (1 nodes): `data.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Graphify Corpus Summary` connect `Graphify Viewer Outputs` to `GCP Deployment Flow`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `God Nodes Core Abstractions` connect `GCP Deployment Flow` to `Graphify Viewer Outputs`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Fit Focus and Zoom Controls`, `Node Type Legend`, `React Root Mount Point` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Chat Retrieval Core` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Graphify Viewer Outputs` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._