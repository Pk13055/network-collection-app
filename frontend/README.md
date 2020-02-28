# Svelte template Application

## Introduction

Svelte production-ready application:
- Material UI
- SPA hash-based routing

## Development

### Non-docker

```bash
npm install
npm run-script build
npm run-script serve
```

### Docker

```bash
docker build . -t image:tag
docker run -p 5000:5000 $PWD:/app image:tag
```