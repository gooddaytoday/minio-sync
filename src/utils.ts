import * as crypto from "crypto";
import * as fs from "fs";

const DEV = process.env.NODE_ENV !== "production";
const TEST = process.env.NODE_ENV === "test";

export function Log(message?: any, ...optionalParams: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    if (DEV && !TEST) console.log(message, ...optionalParams);
}

export function FileMd5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("md5");
        const stream = fs.createReadStream(filePath);

        stream.on("data", data => {
            hash.update(data);
        });

        stream.on("end", () => {
            const md5 = hash.digest("hex");
            resolve(md5);
        });

        stream.on("error", error => {
            Log("Error while calculating md5", error);
            reject(error);
        });
    });
}
