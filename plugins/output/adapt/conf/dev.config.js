module.exports = {
  'adapt-authoring-core': {
    root_dir: "/Users/danielgray/Downloads/adapt-authoring-master",
    temp_dir: "/Users/danielgray/Downloads/adapt-authoring-master/temp"
  },
  'adapt-authoring-jsonschema': {
    formatOverrides: {}
  },
  'adapt-authoring-lang': {
    locale: "en",
    supportedLanguages: ["en"]
  },
  'adapt-authoring-logger': {
    enabledLevels: ["error","warn","success","info","debug"],
    showTimestamp: true
  },
  'adapt-authoring-middleware': {
    acceptedTypes: ["application/json"]
  },
  'adapt-authoring-mongodb': {
    host: "localhost",
    port: 27017,
    dbname: "adapt-refactor"
  },
  'adapt-authoring-server': {
    host: "localhost",
    port: 5001,
    url: "http://localhost:5001",
    logStackOnError: true
  },
  'adapt-authoring-docs': {
    output_dir: "/Users/danielgray/at-docs"
  }
};
