const { readdir, readFile, mkdir, writeFile } = require("fs/promises");
const { ipcRenderer } = require("electron");
const path = require("path");

window.addEventListener("DOMContentLoaded", () => {
  const submitButton = document.querySelector("button[type=submit]");
  const logSection = document.querySelector(".log");

  const displayLogContent = (logText) => {
    while (logSection.hasChildNodes())
      logSection.removeChild(logSection.firstChild);

    const logFrag = document.createDocumentFragment();
    logText.split("\n").forEach((line) => {
      const preLine = document.createElement("pre");
      preLine.textContent = line;
      logFrag.appendChild(preLine);

      if (/^[a-zA-Z]*Error/.test(line)) preLine.classList.add("error");
      else if (line.length < 4 || line.trim()[0] === ".")
        preLine.classList.add("yellow");
    });
    logSection.appendChild(logFrag);
  };

  const options = {
    resolver: null,
    sourcePath: path.resolve(__dirname, "./locales"),
    targetPath: path.resolve(__dirname, "./newLocales"),
    outputPath: path.resolve(__dirname, "./resultLocales"),
  };

  initializeResolvers(options);

  pathInput("source", options);
  pathInput("target", options);
  pathInput("output", options);

  submitButton.addEventListener("click", async () => {
    displayLogContent("PROCESSING");
    submitButton.disabled = true;

    try {
      if (!options.resolver) throw new Error("No resolver selected");

      await processLocales(
        options.sourcePath + "\\",
        options.targetPath + "\\",
        options.outputPath + "\\",
        options.resolver.resolve,
        displayLogContent
      );
    } catch (e) {
      console.error(e);
      displayLogContent(`${e}`);
    }

    submitButton.disabled = false;
  });
});

function initializeResolvers(options) {
  setResolversOptions().addEventListener("change", (e) => {
    const selectNode = e.target;
    const value = selectNode.value;

    options.resolver = resolvers[value];

    selectNode.parentNode.parentNode.querySelector(".description").textContent =
      options.resolver.description;
  });
}

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
async function processLocales(
  sourceParam,
  targetParam,
  resultParam,
  selectedResolver,
  handleLog
) {
  const { oldCountries, newCountries } = await parseLocales(
    sourceParam,
    targetParam
  );
  const newData = await mergeLocales(
    oldCountries,
    newCountries,
    selectedResolver
  );
  await saveLocales(newData, resultParam);
  console.log(logValue);
  handleLog?.(logValue);
  await writeFile("log.yaml", logValue);
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

  return { oldCountries: oldContent, newCountries: newContent };
}

async function mergeLocales(oldCountries, newCountries, resolve) {
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
    const resData = oldCountries.map((oldData) => {
      const newData = isCombined
        ? { ...oldData, data: getUsDiff() }
        : getNewCountryData(options.masterCountry || oldData.country);

      if (!newData) return oldData;
      const mergedData = mergeDatas(oldData, newData, resolve);
      return { ...oldData, data: mergedData };
    });
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
