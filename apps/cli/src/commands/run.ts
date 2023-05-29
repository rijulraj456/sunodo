import { Command, Flags } from "@oclif/core";
import path from "path";
import fs from "fs-extra";
import { execa } from "execa";
import inquirer from "inquirer";

export default class Run extends Command {
    static summary = "Run application node.";

    static description = "Run a local cartesi node for the application.";

    static examples = ["<%= config.bin %> <%= command.id %>"];

    static flags = {
        "block-time": Flags.integer({
            description: "interval between blocks (in seconds)",
            default: 5,
        }),
        "epoch-duration": Flags.integer({
            description: "duration of an epoch (in seconds)",
            default: 86400,
        }),
        verbose: Flags.boolean({
            description: "verbose output",
            default: false,
            char: "v",
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Run);
        const snapshot = path.join(".sunodo", "image");

        // check if snapshot exists
        if (!fs.existsSync(snapshot) || !fs.statSync(snapshot).isDirectory()) {
            throw new Error(
                "Cartesi machine snapshot not found, run 'sunodo build'"
            );
        }

        // read hash of the cartesi machine snapshot
        const hash = fs
            .readFileSync(path.join(snapshot, "hash"))
            .toString("hex");
        const projectName = hash.substring(0, 8);

        // setup the environment variable used in docker compose
        const blockInterval = flags["block-time"];
        const epochDuration = flags["epoch-duration"];
        const env: NodeJS.ProcessEnv = {
            BLOCK_TIME: blockInterval.toString(),
            BLOCK_TIMEOUT: (blockInterval + 3).toString(),
            EPOCH_DURATION: epochDuration.toString(),
        };

        // resolve compose file location based on version
        const composeFile = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "..",
            "node",
            "docker-compose.yml"
        );

        const args = [
            "compose",
            "--file",
            composeFile,
            "--project-directory",
            ".",
            "--project-name",
            projectName,
        ];

        const mode = flags.verbose ? [] : ["--detach", "--wait"];

        this.log("Starting node...");
        try {
            // run compose environment
            await execa("docker", [...args, "up", ...mode], {
                stdio: "inherit",
                env,
            });

            if (!flags.verbose) {
                const host = "http://127.0.0.1";
                this.log(`Anvil listening at ${host}:8545`);
                this.log(`GraphQL Server listening at ${host}:8080/graphql`);
                this.log(`Inspect Server listening at ${host}:8080/inspect`);

                await inquirer.prompt({
                    name: "continue",
                    type: "confirm",
                    message: "Press enter to stop the node",
                });
            }
        } finally {
            // shut it down, including volumes
            await execa("docker", [...args, "down", "--volumes"], {
                stdio: "inherit",
            });
        }
    }
}