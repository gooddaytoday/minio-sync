import * as chokidar from "chokidar";
import { Manager } from "./manager";
import { Log } from "./utils";

export class Watcher {
    private watcher: chokidar.FSWatcher;
    private rootPath: string;
    private manager: Manager;
    private logChanges: boolean = false;

    constructor(rootPath: string, manager: Manager) {
        this.rootPath = rootPath;
        this.manager = manager;
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
        this.Log(fullpath, "  > File added");
        this.manager.UploadFile(this.RelPath(fullpath), fullpath);
    }

    private OnChange(fullpath: string): void {
        this.Log(fullpath, "  > File changed");
        this.manager.UpdateFile(this.RelPath(fullpath), fullpath);
    }

    private OnUnlink(fullpath: string): void {
        this.Log(fullpath, "  > File removed");
        this.manager.DeleteFile(this.RelPath(fullpath));
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
        this.manager.Sync();
    }

    private Log(fullpath: string, msg: string): void {
        if (this.logChanges) Log(msg.padEnd(20), this.RelPath(fullpath));
    }

    private RelPath(fullpath: string): string {
        return fullpath.replace(this.rootPath, "");
    }

    public get Watcher(): chokidar.FSWatcher {
        return this.watcher;
    }
}
