const { readdir, readFile, mkdir, writeFile } = require("fs/promises");

const sourceParam = `./${process.argv[2] || "locales"}/`;
const targetParam = `./${process.argv[3] || "targetLocales"}/`;
const resultParam = `./${process.argv[4] || "resultLocales"}/`;
const { displayLog, queueLog } = makeLogger();
main();

const masterCountry = "us";

const changeLog = (
  oldValue,
  comparerValue,
  resValue,
  key,
  country,
  fileData
) => {
  console.log(`\t\t${key}: ${oldValue} | ${comparerValue} => ${resValue}\n`);
};

const resolvers = {
  mergeResolve(oldValue, comparerValue) {
    let result = comparerValue;
    if (!comparerValue) result = oldValue;
    return result;
  },
  addResolve(oldValue, comparerValue) {
    if (!oldValue && comparerValue) 
      return comparerValue;
    return oldValue;
  },
};

async function main() {
  const { oldCountries, newCountries } = await parseLocales(
    sourceParam,
    targetParam
  );
  const newData = await mergeLocales(
    oldCountries,
    newCountries,
    resolvers.addResolve
  );
  await saveLocales(newData, resultParam);
  displayLog();
}

async function parseLocales(source, target) {
  if (!source || !target) throw new Error("Not enough parameters provided!");
  const dirToCountryData = async (name, path) => {
    const jsonFilter = (fileName) => /.json$/i.test(fileName);
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
  const resData = oldCountries.map((oldData) => {
    const newData = getNewCountryData(oldData.country);
    let result = oldData;
    if (newData) {
      const mergedData = mergeDatas(oldData, newData);
      result = { ...oldData, data: mergedData };
    }
    return result;
  });

  return resData;

  function getCountryData(country, countries) {
    const countryData = countries.find(({ country: _country }) =>
      masterCountry ? _country === masterCountry : country === _country
    );
    // if (countryData) countryData.country = country;
    if (!countryData) throw new NotFoundError(country, "country");
    return countryData;
  }
  function getOldCountryData(country) {
    return getCountryData(country, oldCountries);
  }
  function getNewCountryData(country) {
    return getCountryData(country, newCountries);
  }
  function mergeDatas(oldFiles, newFiles) {
    const { country } = oldFiles;
    const logSingleCountry = logSingleF();
    return oldFiles.data.map((fileData) => {
      const logSingleFile = logSingleF();
      const { file: fileName, content: oldContent, path: oldPath } = fileData;
      const { content: newContent, path: newPath } = findFile(fileName);
      const resData = deepObjectMap(
        oldContent,
        (oldValue, comparerValue, key) => {
          const resValue = resolve(oldValue, comparerValue);

          if (oldValue !== resValue) {
            logSingleCountry(country);
            logSingleFile(`\t${fileName}`);
            changeLog(oldValue, comparerValue, resValue, key, country, fileData);
          }

          return resValue;
        },
        newContent
      );
      return { ...fileData, content: resData };
      // return { ...fileData, content: resData };
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

function deepObjectMap(obj, mapFunc, extraCompareObject, objKey) {
  if (typeof obj === "object") {
		if(!extraCompareObject) return obj;
    const entries = Object.entries(obj);
    const extraEntries = Object.entries(extraCompareObject).filter(
      ([newKey]) => !entries.some(([key]) => newKey === key)
    );

    const mappedExtraEntries = extraEntries
      .map(([key, value]) => [key, mapFunc(null, value, key)])
      .filter((entry) => entry);

    const newEntries = [...entries, ...mappedExtraEntries].map(
      ([key, value]) => {
        const newValue = deepObjectMap(
          value,
          mapFunc,
          extraCompareObject?.[key],
          key
        );
        return [key, newValue];
      }
    );
    return Object.fromEntries(newEntries);
  }
  return mapFunc(obj, extraCompareObject, objKey);
}

function makeLogger() {
  const logArray = [];
  const queueLog = (item) => {
    if (!logArray.includes(item)) logArray.push(item);
  };
  const displayLog = () => logArray.forEach((item) => console.log(item));
  return { queueLog, displayLog };
}
function logSingleF() {
  let logged = false;
  return (value) => {
    if (!logged) {
      logged = true;
      console.log(value);
    }
  };
}
function stringify(value) {
  if (typeof value !== "object") return value;
  return JSON.stringify(value, null, 2);
}
class NotFoundError extends Error {
  value;
  constructor(value, type) {
    super(`No ${type} found! ${value}`);
    this.value = value;
  }
}
