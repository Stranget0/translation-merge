const { readdir, readFile, mkdir, writeFile } = require("fs/promises");

const sourceParam = `./${process.argv[2] || "locales"}/`;
const targetParam = `./${process.argv[3] || "targetLocales"}/`;
const resultParam = `./${process.argv[4] || "resultLocales"}/`;
main();

function defaultResolve(oldValue, newValue) {
  let result = newValue;
  if (!newValue) result = oldValue;
  return result;
}

async function main() {
  const { oldCountries, newCountries } = await parseLocales(
    sourceParam,
    targetParam
  );
  const newData = await mergeLocales(oldCountries, newCountries);

  saveLocales(newData, resultParam);
}

async function mergeLocales(
  oldCountries,
  newCountries,
  resolve = defaultResolve
) {
  const resData = oldCountries.map((countryData) => {
    const { country, data: oldData } = countryData;
    const newData = getNewCountryData(country)?.data;
    let result = countryData;

    if (newData) {
      const mergedData = mergeDatas(oldData, newData);
      result = { ...countryData, data: mergedData };
    }
    return result;
  });
  return resData;

  function getCountryData(country, countries) {
    const countryData = countries.find(
      ({ country: _country }) => country === _country
    );
    if (!countryData) throw new NotFoundError(country, "country");
    return countryData;
  }
  function getOldCountryData(country) {
    return getCountryData(country, oldCountries);
  }
  function getNewCountryData(country) {
    try {
      return getCountryData(country, newCountries);
    } catch (e) {
      if (e instanceof NotFoundError) return null;
      throw e;
    }
  }
  function mergeDatas(oldFiles, newFiles) {
    return oldFiles.map((fileData) => {
      const { file: fileName, content: oldContent } = fileData;
      const { content: newContent } = findFile(fileName);
      // const oldContentEntr = Object.entries(oldContent);
      // const resContent = DeepMapObject(oldContent, ([category, oldCatData]) => {
      const resData = deepObjectMap(
        oldContent,
        (oldValue, newValue) => {
          const resValue = resolve(oldValue, newValue);
          if (newValue !== oldValue && !/[a-z]/i.test(oldValue))
            console.log({fileName, oldValue, newValue, resValue });
          return resValue;
        },
        newContent
      );
      return {...fileData, content: resData };
    });

    function findFile(name, inNew = true) {
      let arr = newFiles;
      if (!inNew) arr = oldFiles;
      const file = arr.find(({ file }) => file === name);
      if (!file) throw new NotFoundError(name, "file");
      return file;
    }
  }
}
async function parseLocales(source, target) {
  if (!source || !target) throw new Error("Not enough parameters provided!");
  const dirToCountryData = async (name, path) => {
    const filterJson = (fileName) => /.json$/i.test(fileName);
    const files = (await readdir(path)).filter(filterJson);
    const filePaths = files.map((f) => `${path}/${f}`);
    const buffors = await Promise.all(filePaths.map((p) => readFile(p)));
    const fileContents = buffors.map((b) => JSON.parse(b.toString("utf8")));

    const data = files.map((file, i) => ({
      file,
      path: filePaths[i],
      content: fileContents[i],
    }));

    return {
      country: name,
      data,
      // content: { files: files, paths: filePaths, fileContent },
    };
  };
  const [oldFiles, newFiles] = await Promise.all([
    readdir(source),
    readdir(target),
  ]);
  const makeLangObj = (path, files) =>
    Promise.all(files.map((d) => dirToCountryData(d, path + d)));

  const [oldContent, newContent] = await Promise.all([
    makeLangObj(source, oldFiles),
    makeLangObj(target, newFiles),
  ]);
  return { oldCountries: oldContent, newCountries: newContent };
}
async function saveLocales(resCountries, destination) {
  resCountries.forEach(async (countryData) => {
    const { country, data } = countryData;
    const dest = destination + country;
    await mkdir(dest, { recursive: true });
    data.forEach(({ file, content }) => {
      if (content !== undefined) {
        const fileContent = JSON.stringify(content, null, '\t');
        writeFile(`${dest}/${file}`, fileContent);
      }
    });
  });
}

function deepObjectMap(obj, mapFunc, extraCompareObject) {
  if (typeof obj === "object") {
    const entries = Object.entries(obj);
    const newEntries = entries.map(([key, value]) => {
      const newValue = deepObjectMap(value, mapFunc, extraCompareObject?.[key]);
      return [key, newValue];
    });
    return Object.fromEntries(newEntries);
  }
  return mapFunc(obj, extraCompareObject);
}

class NotFoundError extends Error {
  value;
  constructor(value, type) {
    super(`No ${type} found! ${value}`);
    this.value = value;
  }
}
