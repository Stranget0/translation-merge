# Translation merge

This app is used to mix translation json files structured in a ./[language]/[file].json fashion.
It has different resolvers that define the outcome of the merge.

## How to use

### It takes `two locales folders` paths containing languages such as us, pl, etc.
#### The `source` folder is usually the old locales which you want to transform.
#### Its values are compared with…
#### The `target` folder. The source values are compared with target values. 
#### The outcome is defined by the selected `resolver`.
#### Compares and mixes the data using `resolver` and `transforms` the results to the `output` path.

## Resolvers
### combine
Compares the US languages between two folders and if differences are present then sets them in US and other languages. Also adds new and missing entries.
Probably what you usually want.
### sync
Removes deleted entries and adds missing ones
### add
Adds missing values
### filter
Removes “” or deleted values

#### Master country
Extra option to use when you want to for example add missing translations in other languages based on the master language.

It forces the program to always compare old values with target’s master language values, such as US.
