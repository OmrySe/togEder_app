// mock in-memory implementation of a persistent database
// switch this out for a real database in production

const db = {
    transcripts: {
        // [bot id]: [transcript]
    },
    chat: {},  
  //  events: {},
};

export default db;
