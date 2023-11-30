import * as chokidar from "chokidar";
import MinIO from "./minio";
import { Log } from "./utils";

export class Watcher {
    private watcher: chokidar.FSWatcher;
    private rootPath: string;
    private minio: MinIO;
    private sync: boolean = true;
    private logChanges: boolean = false;

    constructor(rootPath: string, minio: MinIO) {
        this.rootPath = rootPath;
        this.minio = minio;
        this.watcher = chokidar.watch(rootPath, {
            ignored: ["node_modules/**"],
            awaitWriteFinish: {
                pollInterval: 500,
                stabilityThreshold: 5000,
            },
        });

        this.watcher
            .on("add", this.OnAdd.bind(this))
            .on("change", this.OnChange.bind(this))
            .on("unlink", this.OnUnlink.bind(this))
            .on("addDir", this.OnAddDir.bind(this))
            .on("unlinkDir", this.OnUnlinkDir.bind(this))
            .on("error", this.OnError.bind(this))
            .on("ready", this.OnReady.bind(this));
    }

    private OnAdd(fullpath: string): void {
        this.Log(fullpath, "File added");
        if (this.sync) this.minio.UploadFile(this.Path(fullpath), fullpath);
    }

    private OnChange(fullpath: string): void {
        this.Log(fullpath, "File changed");
        if (this.sync) this.minio.UpdateFile(this.Path(fullpath), fullpath);
    }

    private OnUnlink(fullpath: string): void {
        this.Log(fullpath, "File removed");
        if (this.sync) this.minio.DeleteFile(this.Path(fullpath));
    }

    private OnAddDir(fullpath: string): void {
        this.Log(fullpath, "Directory added");
    }

    private OnUnlinkDir(fullpath: string): void {
        this.Log(fullpath, "Directory removed");
    }

    private OnError(error: any): void {
        console.error("Watcher error: ", error);
    }

    private OnReady(): void {
        Log("\nInitial scan complete. Ready for changes...");
        this.logChanges = process.env.NODE_ENV !== "production";
    }

    private Log(fullpath: string, msg: string): void {
        if (this.logChanges) Log(msg.padEnd(20), this.Path(fullpath));
    }

    private Path(fullpath: string): string {
        return fullpath.replace(this.rootPath, "");
    }

    public get Watcher(): chokidar.FSWatcher {
        return this.watcher;
    }
}
