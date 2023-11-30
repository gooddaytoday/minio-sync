import * as crypto from "crypto";
import * as fs from "fs";

const DEV = process.env.NODE_ENV !== "production";
const TEST = process.env.NODE_ENV === "test";

export function Log(message?: any, ...optionalParams: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (DEV && !TEST) console.log(message, ...optionalParams);
}

const chunkSize = 64 * 1024 * 1024;
const emptyEtag = "d41d8cd98f00b204e9800998ecf8427e";

export function CalcEtag(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const partHashes: Buffer[] = [];
        const stream = fs.createReadStream(filePath, {
            highWaterMark: chunkSize,
        });

        stream.on("data", partData => {
            partHashes.push(crypto.createHash("md5").update(partData).digest());
        });

        stream.on("end", () => {
            if (partHashes.length == 0) {
                resolve(emptyEtag);
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
