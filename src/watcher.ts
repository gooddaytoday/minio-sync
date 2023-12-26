import * as chokidar from "chokidar";
import { Manager } from "./manager";
import { Log } from "./utils";

export interface IWatchOptions extends chokidar.WatchOptions {}

type TAnymatchFn = (testString: string) => boolean;
type TAnymatchPattern = string | RegExp | TAnymatchFn;
const DefaultIgnored: TAnymatchPattern[] = ["node_modules/**"];

export class Watcher {
    private watcher: chokidar.FSWatcher;
    private rootPath: string;
    private manager: Manager;
    private stopWatchCount = 0;
    private logChanges: boolean = false;

    constructor(rootPath: string, manager: Manager, opts?: IWatchOptions) {
        this.rootPath = rootPath;
        this.manager = manager;
        if (typeof opts == "undefined") {
            opts = {};
        }
        if (typeof opts.ignored == "undefined") {
            opts.ignored = DefaultIgnored;
        } else {
            if (Array.isArray(opts.ignored)) {
                opts.ignored.push(...DefaultIgnored);
            } else {
                opts.ignored = DefaultIgnored.slice().concat(opts.ignored);
            }
        }
        if (typeof opts.awaitWriteFinish == "undefined") {
            opts.awaitWriteFinish = {
                pollInterval: 500,
                stabilityThreshold: 5000,
            };
        }
        opts.ignoreInitial = false; // Should be false in current implementation
        this.watcher = chokidar.watch(rootPath, opts);

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

    public StopWatch(): void {
        if (this.stopWatchCount == 0) {
            this.watcher.unwatch(this.rootPath);
        }
        this.stopWatchCount++;
    }

    public ResumeWatch(): void {
        if (this.stopWatchCount > 0) {
            this.stopWatchCount--;
            if (this.stopWatchCount == 0) {
                this.watcher.add(this.rootPath);
            }
        } else {
            throw new Error("Watcher is not stopped");
        }
    }

    public async Close(): Promise<void> {
        return this.watcher.close();
    }

    /**
     * Sets callback to be called on end of syncing
     * @param cb Callback to be called on end of syncing
     */
    public OnSyncEnd(cb: () => void): void {
        this.manager.OnSyncEnd(cb);
    }
}
