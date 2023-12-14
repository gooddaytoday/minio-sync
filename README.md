# MinIO folders sync

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
        Permissions: {
            /** Read from MinIO storage */
            Read: true,
            /** Write to MinIO storage */
            Write: true,
        },
        MinIO: {
            Bucket: "test-store",
            EndPoint: "127.0.0.1",
            Port: 9000,
            UseSSL: false,
            AccessKey: "<YOUR_MINIO_ACCESSKEY>",
            SecretKey: "<YOUR_MINIO_SECRETKEY>",
        },
        WatchOptions: {
            ignored: [
                // Ignore by string glob pattern
                "ignore_folder/**",
                // Ignore by regex pattern
                /SomeIgnoreRegexPattern/,
                // Ignore by callback function
                function (path: string): boolean {
                    return path.split("/").length > 10; // Don't sync deep more than 10 levels
                }
            ]
        }
});
```

- Permissions: its highly recommended to use `Write` permissions only for one application node, cause there is no object blocking implementation on storage side now.
- WatchOptions: options from [chokidar](https://www.npmjs.com/package/chokidar)

### Path filtering

- `ignoreInitial` - always will be `false` due to current implementation
- `ignored` ([anymatch](https://github.com/es128/anymatch)-compatible definition)
Defines files/paths to be ignored. The whole relative or absolute path is
tested, not just filename. If a function with two arguments is provided, it
gets called twice per path - once with a single argument (the path), second
time with two arguments (the path and the
instantiating the watching as chokidar discovers these file paths (before the `ready` event).
