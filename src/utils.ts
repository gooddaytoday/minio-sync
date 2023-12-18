import * as crypto from "crypto";
import * as fs from "fs";
import { exists, stat } from "fs-extra";

const DEV = process.env.NODE_ENV !== "production";
const TEST = process.env.NODE_ENV === "test";

export function Log(message?: any, ...optionalParams: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (DEV && !TEST) console.log(message, ...optionalParams);
}

export function DebugAssert(condition: boolean, message: string): void {
    if (DEV && !condition) {
        throw new Error(message);
    }
}

export function DebugFail(message: string): void {
    if (DEV) {
        throw new Error(message);
    }
}

/** Generates uniq Hash string */
export function GUID(): string {
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    return (
        bytes.toString("hex", 0, 4) +
        "-" +
        bytes.toString("hex", 4, 6) +
        "-" +
        bytes.toString("hex", 6, 8) +
        "-" +
        bytes.toString("hex", 8, 10) +
        "-" +
        bytes.toString("hex", 10, 16)
    );
}

export type TObjItem = {
    size: number;
    etag: string | null;
};

export async function IsFileEqual(
    fullpath: string,
    objData: TObjItem
): Promise<boolean> {
    if (await exists(fullpath)) {
        const fileStat = await stat(fullpath);
        return (
            (objData.size == 0 && fileStat.size == 0) ||
            (objData.size == fileStat.size &&
                objData.etag === (await CalcEtag(fullpath)))
        );
    } else {
        return false;
    }
}

const ChunkSize = 64 * 1024 * 1024;
const EmptyEtag = "d41d8cd98f00b204e9800998ecf8427e";

function IsErrnoException(error: any): error is NodeJS.ErrnoException {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return error instanceof Error && (<any>error).code !== undefined;
}

const CalcEtagAttempts = 5;

export async function CalcEtag(filePath: string): Promise<string> {
    const errors: Error[] = [];
    for (let i = 0; i <= CalcEtagAttempts; i++) {
        try {
            const etag = await DoCalcEtag(filePath);
            return etag;
        } catch (error) {
            if (IsErrnoException(error)) {
                if (error.code == "EBUSY") {
                    if (i != CalcEtagAttempts) {
                        await new Promise(resolve =>
                            setTimeout(resolve, 5000 * i)
                        );
                        continue;
                    } else {
                        errors.push(error);
                    }
                }
            }
            if (error instanceof Error) {
                errors.push(error);
            } else {
                throw error;
            }
        }
    }
    DebugAssert(errors.length > 0, "Cannot be empty errors list");
    throw new AggregateError(errors, "Errors while calculating md5");
}

function DoCalcEtag(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const partHashes: Buffer[] = [];
        const stream = fs.createReadStream(filePath, {
            highWaterMark: ChunkSize,
        });

        stream.on("data", partData => {
            partHashes.push(crypto.createHash("md5").update(partData).digest());
        });

        stream.on("end", () => {
            if (partHashes.length == 0) {
                resolve(EmptyEtag);
            } else {
                const hashesCount = partHashes.length;
                if (hashesCount > 1) {
                    const hashResult = crypto
                        .createHash("md5")
                        .update(Buffer.concat(partHashes))
                        .digest("hex");
                    resolve(hashResult + "-" + hashesCount);
                } else {
                    resolve(partHashes[0].toString("hex"));
                }
            }
        });

        stream.on("error", error => {
            Log("Error while calculating md5", error);
            reject(error);
        });
    });
}

export class AggregateError extends Error {
    errors: Error[];
    constructor(errors: Error[], message: string) {
        super(message);
        this.errors = [];
        const uniqErrsMsgs = new Set<string>();
        for (const err of errors) {
            if (!uniqErrsMsgs.has(err.message)) {
                uniqErrsMsgs.add(err.message);
                this.errors.push(err);
            }
        }
    }

    get message(): string {
        let aggregateMessage = super.message + ":\n";
        for (const error of this.errors) {
            aggregateMessage += error.message + "\n";
        }
        return aggregateMessage;
    }
}
