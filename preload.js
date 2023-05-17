const { readdir, readFile, mkdir, writeFile } = require("fs/promises");
const { ipcRenderer } = require("electron");
const path = require("path");

window.addEventListener("DOMContentLoaded", () => {
  const options = {
    resolver: null,
    sourcePath: path.resolve(__dirname, "./locales"),
    targetPath: path.resolve(__dirname, "./newLocales"),
    outputPath: path.resolve(__dirname, "./resultLocales"),
  };

  setResolversOptions().addEventListener("change", (e) => {
    const selectNode = e.target;
    const value = selectNode.value;

    options.resolver = resolvers[value];

    selectNode.parentNode.parentNode.querySelector(".description").textContent =
      options.resolver.description;
  });

  pathInput("source", options);
  pathInput("target", options);
  pathInput("output", options);
});

function pathInput(type, options) {
  const inputNode = document.querySelector(`button#${type}-button`);
  const valueNode = document.querySelector(`#${type}-path`);
  valueNode.textContent = options[`${type}Path`];

  inputNode.addEventListener("click", async () => {
    const newValue = await ipcRenderer.invoke("folder:open", type);

    options[`${type}Path`] = newValue;
    valueNode.textContent = newValue;
  });
}

// const path = require("path");
// const cliProgress = require("cli-progress");
// const colors = require("ansi-colors");

const resolvers = {
  add: {
    description:
      "Add new entries missing in source folder and apparent in target folder",
    resolve(oldValue, comparerValue) {
      if (!oldValue && comparerValue) return comparerValue;
      return oldValue;
    },
  },
  filter: {
    description: 'filter out deleted or empty or "" entries',
    resolve(oldValue, comparerValue) {
      if (isNotNullish(comparerValue)) return oldValue;
      return null;
    },
  },
  sync: {
    description:
      "add missing entries and remove deleted and only deleted entries",
    resolve(oldValue, comparerValue) {
      if (comparerValue === null || comparerValue === undefined) return null;
      if (comparerValue && !oldValue) return comparerValue;
      return oldValue;
    },
  },
  diff: {
    description: "put out only differences between source and target",
    resolve(oldValue, comparerValue) {
      if (comparerValue && comparerValue !== oldValue) return comparerValue;
      return null;
    },
  },
  combine: {
    description:
      "compare the us locales of source and target and if changed replace these entries in us and other languages with target english entry",
    resolve(oldValue, comparerValue) {
      if (comparerValue) return comparerValue;
      return oldValue;
    },
  },
};

// const options = yargs
//   .usage("node . -r [resolver] [other options]")
//   .option("r", {
//     alias: "resolver",
//     choices: Object.keys(resolvers),
//     describe: "Resolver to use",
//     demandOption: true,
//   })
//   .option("s", {
//     alias: "source",
//     describe: "path to old locales folder",
//     default: "locales",
//   })
//   .option("t", {
//     alias: "target",
//     describe: `path to new locales folder. Can be the same as source folder to self compare it with -c option country\n\n options: ${Object.entries(
//       resolvers
//     ).reduce(
//       (acc, [resolver, { description }]) =>
//         `${acc}${resolver}: ${description}\n\n`,
//       ""
//     )}`,
//     default: "newLocales",
//   })
//   .option("o", {
//     alias: "output",
//     describe:
//       "path to the output folder. Can be the same as source folder to override it",
//     default: "resultLocales",
//   })
//   .option("c", {
//     alias: "masterCountry",
//     describe:
//       "country from new locales to always use when comparing with old values. Has no effect for combine resolver",
//   }).argv;

// const sourceParam = path.resolve(options.source) + "\\";
// const targetParam = path.resolve(options.target) + "\\";
// const resultParam = path.resolve(options.output) + "\\";

let logValue = "";
let ignoreLog = false;

// #region OPTIONS

const sibsToSort = [
  /challenge_/,
  /dailyChallenge_/,
  /weeklyChallenge/,
  /^\d+$/,
];

// Logger
const changeLog = (oldValue, comparerValue, resValue, key, objPath) => {
  if (ignoreLog) return;
  logValue += `\t\t${objPath}: ${oldValue} | ${comparerValue} => ${resValue}\n`;
};

function logSingleF() {
  let logged = false;
  return (value) => {
    if (!logged && !ignoreLog) {
      logged = true;
      logValue += value + "\n ";
    }
  };
}

const trackedKeys = [];
const fileNameReg = /.json$/i;
//#endregion

// BEGINNING OF ALGORITHM
async function main(sourceParam, targetParam, resultParam) {
  const { oldCountries, newCountries, filesCount } = await parseLocales(
    sourceParam,
    targetParam
  );
  const newData = await mergeLocales(
    oldCountries,
    newCountries,
    // Change this to use a different resolver
    resolvers[options.resolver].resolve,
    filesCount
  );
  await saveLocales(newData, resultParam);
  console.log(logValue);
  await writeFile("log.yaml", logValue);
  // displayLog();
}

async function parseLocales(source, target) {
  if (!source || !target) throw new Error("Not enough parameters provided!");
  const dirToCountryData = async (name, path) => {
    const jsonFilter = (fileName) => fileNameReg.test(fileName);
    const files = (await readdir(path)).filter(jsonFilter);
    const filePaths = files.map((f) => `${path}/${f}`);
    const buffors = await Promise.all(filePaths.map((p) => readFile(p)));
    const fileContents = buffors.map((b, i) => {
      try {
        return JSON.parse(b.toString("utf8").trim());
      } catch (e) {
        console.log(filePaths[i], e, "\n\n");
      }
    });

    const data = files.map((file, i) => ({
      file,
      path: filePaths[i],
      content: fileContents[i],
    }));

    return {
      country: name,
      data,
    };
  };
  const makeLangObj = (path, files) =>
    Promise.all(files.map((d) => dirToCountryData(d, path + d)));

  if (!source || !target) throw new Error("Not enough parameters provided!");
  const [oldFiles, newFiles] = await Promise.all([
    readdir(source),
    readdir(target),
  ]);

  const [oldContent, newContent] = await Promise.all([
    makeLangObj(source, oldFiles),
    makeLangObj(target, newFiles),
  ]);

  const filesCount = countFilesCount(oldContent);

  return { oldCountries: oldContent, newCountries: newContent, filesCount };

  function countFilesCount(countries) {
    return countries.reduce((acc, { data }) => data.length + acc, 0);
  }
}

async function mergeLocales(oldCountries, newCountries, resolve, filesCount) {
  let usDiffMemo = null;
  const isCombined = resolve === resolvers.combine.resolve;
  return transformCountries();

  function getUsDiff() {
    if (usDiffMemo) return usDiffMemo;
    ignoreLog = true;
    const oldUs = getCountryData("us", oldCountries);
    const newUs = getCountryData("us", newCountries);
    if (!oldUs || !newUs) throw new Error("Couldn't find us locale");
    const diffUs = mergeDatas(oldUs, newUs, resolvers.diff.resolve);
    usDiffMemo = diffUs;
    ignoreLog = false;
    return diffUs;
  }

  function transformCountries() {
    // progress.start(filesCount, 0, { country: "locales", fileName: "" });
    const resData = oldCountries.map((oldData) => {
      const newData = isCombined
        ? { ...oldData, data: getUsDiff() }
        : getNewCountryData(options.masterCountry || oldData.country);

      if (!newData) return oldData;
      const mergedData = mergeDatas(oldData, newData, resolve);
      return { ...oldData, data: mergedData };
    });
    // progress.stop();
    return resData;
  }

  function getCountryData(country, countries) {
    const countryData = countries.find(
      ({ country: _country }) => _country === country
    );
    return countryData;
  }
  function getOldCountryData(country) {
    return getCountryData(country, oldCountries);
  }
  function getNewCountryData(country) {
    return getCountryData(country, newCountries);
  }
  function mergeDatas(oldFiles, newFiles, resolve) {
    const { country } = oldFiles;
    const logSingleCountry = logSingleF();
    return oldFiles.data.map((fileData) => {
      const logSingleFile = logSingleF();
      const { file: fileName, content: oldContent, path: oldPath } = fileData;
      const { content: newContent, path: newPath } = findFile(fileName);
      const resData = deepObjectMap(
        oldContent,
        (oldValue, comparerValue, key, objPath) => {
          const resValue = resolve(oldValue, comparerValue);
          if (oldValue !== resValue || trackedKeys.includes(key)) {
            logSingleCountry(country);
            logSingleFile(`\t${fileName}`);
            changeLog(oldValue, comparerValue, resValue, key, objPath);
          }

          return resValue;
        },
        newContent
      );
      // if (!ignoreLog) progress.increment(1, { country, fileName });
      return { ...fileData, content: resData };
    });

    function findFile(name, inNew = true) {
      let arr = newFiles.data;
      if (!inNew) arr = oldFiles.data;
      const file = arr.find(({ file }) => file === name);
      if (!file) throw new NotFoundError(name, "file");
      return file;
    }
  }
}

async function saveLocales(resCountries, destination) {
  resCountries.forEach(async (countryData) => {
    const { country, data } = countryData;
    const dest = destination + country;
    await mkdir(dest, { recursive: true });
    data.forEach(({ file, content }) => {
      if (content !== undefined) {
        const fileContent = JSON.stringify(content, null, "\t");
        writeFile(`${dest}/${file}`, fileContent);
      }
    });
  });
}

function deepObjectMap(
  obj,
  mapFunc,
  extraCompareObject,
  objKey = "",
  objPath = ""
) {
  function deleteNullish(entries) {
    return entries.filter(([, value]) => isNotNullish(value));
  }

  if (typeof obj === "object") {
    if (!extraCompareObject) return obj;
    const entries = Object.entries(obj);
    const extraEntries = Object.entries(extraCompareObject).filter(
      ([newKey]) => !entries.some(([key]) => newKey === key)
    );
    const mappedExtraEntries = deleteNullish(
      extraEntries.map(([key, value]) => [
        key,
        mapFunc(null, value, key, `${objPath}.${key}`),
      ])
    );

    const newEntries = deleteNullish(
      [...entries, ...mappedExtraEntries].map(([key, value]) => {
        const newValue = deepObjectMap(
          value,
          mapFunc,
          extraCompareObject?.[key],
          key,
          `${objPath}.${key}`
        );
        return [key, newValue];
      })
    );
    if (
      sibsToSort &&
      newEntries.find(([key]) => sibsToSort.some((reg) => reg.test(key)))
    ) {
      newEntries.sort();
    }

    return Object.fromEntries(newEntries);
  }
  return mapFunc(obj, extraCompareObject, objKey, objPath);
}

function makeLogger() {
  const logArray = [];
  const queueLog = (item) => {
    if (!logArray.includes(item)) logArray.push(item);
  };
  const displayLog = () => logArray.forEach((item) => console.log(item));
  return { queueLog, displayLog };
}

function stringify(value) {
  if (typeof value !== "object") return value;
  return JSON.stringify(value, null, 2);
}
function isNotNullish(value) {
  return value !== null && value !== undefined;
}

class NotFoundError extends Error {
  value;
  constructor(value, type, message) {
    super(`No ${type} found! ${value}: ${message}`);
    this.value = value;
  }
}

function setResolversOptions() {
  const selectResolve = document.querySelector("select#resolvers");

  selectResolve.append(createResolveOptions());
  return selectResolve;
}

function createResolveOptions() {
  const optionsFrag = document.createDocumentFragment();

  const options = Object.entries(resolvers).map(([name, { description }]) => ({
    name,
    description,
  }));

  for (const { name, description } of options) {
    const optionNode = document.createElement("option");
    optionNode.value = name;
    optionNode.textContent = name;
    optionNode.dataset.description = description;

    optionsFrag.appendChild(optionNode);
  }

  return optionsFrag;
}
