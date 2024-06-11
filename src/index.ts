import { IPermissions, Manager } from "./manager";
import MinIO, { IMinIOConfig } from "./minio";
import { Log } from "./utils";
import { IWatchOptions, Watcher } from "./watcher";

interface ISyncConfig {
    Permissions: IPermissions;
    MinIO: IMinIOConfig;
    WatchOptions?: IWatchOptions;
    /** Execute upload/download in parallel for separate files or in one global queue. Default: true */
    Parallel?: boolean;
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
    const manager = new Manager(
        rootPath,
        minIO,
        {
            Read: config.Permissions.Read,
            Write: config.Permissions.Write,
        },
        config.Parallel
    );
    const watcher = new Watcher(rootPath, manager, config.WatchOptions);
    return watcher;
}
