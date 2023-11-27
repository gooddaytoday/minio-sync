# MinIO folders sync

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Code Coverage][codecov-img]][codecov-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

> NPM package for folders synchronization via MinIO

## Install

```bash
npm install minio-sync
```

## Usage

```ts
import minioSync from 'minio-sync';

minioSync(
    "path/to/folder",
    {
        MinIO: {
            Bucket: "test-store",
            EndPoint: "127.0.0.1",
            Port: 9000,
            UseSSL: false,
            AccessKey: "<YOUR_MINIO_ACCESSKEY>",
            SecretKey: "<YOUR_MINIO_SECRETKEY>",
        }
});
```
