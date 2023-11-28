import MinIO, { IMinIOConfig } from "./minio";
import { Log } from "./utils";
import { Watcher } from "./watcher";

interface ISyncConfig {
    MinIO: IMinIOConfig;
}

export default async function Sync(
    rootPath: string,
    config: ISyncConfig
): Promise<Watcher> {
    Log(`\n\n=== Syncing ${rootPath} with MinIO ===\n`);
    const minIO = new MinIO(config.MinIO);
    await minIO.Init().catch(e => {
        console.error("Error while initializing minio", e);
        throw e;
    });
    const watcher = new Watcher(rootPath, minIO);
    return watcher;
}
