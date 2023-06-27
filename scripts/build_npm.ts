import { build, emptyDir } from "https://deno.land/x/dnt@0.37.0/mod.ts";

if (
  ![...Deno.readDirSync(Deno.cwd())].some(
    (entry) => entry.isFile && entry.name == "mod.ts"
  )
) {
  console.log("[err] run this outside the scripts folder");
  Deno.exit(1);
}

if (!Deno.args[0]) {
  console.log("[err] version number not given");
  Deno.exit(1);
}

// these paths are relative to the execution directory!

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  declaration: "inline",

  shims: {
    deno: {
      test: "dev",
    },
    crypto: true,
  },

  package: {
    name: "unocab",
    version: Deno.args[0],
    description: "An UNO game engine",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/uditkarode/unocab",
    },
    bugs: {
      url: "https://github.com/uditkarode/unocab/issues",
    },
  },

  postBuild() {
    // steps to run after building and before running the tests
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
