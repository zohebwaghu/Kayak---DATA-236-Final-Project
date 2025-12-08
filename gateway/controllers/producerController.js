/**
 * Producer Controller
 * Encapsulates publishing events to Kafka with correlation IDs.
 */

const { getProducer, shutdownProducer } = require('../config/kafkaProducer');

const publishEvent = async (topic, key, payload) => {
  const producer = getProducer();
  await producer.send({
    topic,
    messages: [
      {
        key: key ? String(key) : undefined,
        value: JSON.stringify({
          timestamp: new Date().toISOString(),
          ...payload,
        }),
      },
    ],
  });
};

const gracefulShutdown = async () => {
  await shutdownProducer();
};

module.exports = {
  publishEvent,
  gracefulShutdown,
  initProducer: require('../config/kafkaProducer').initProducer,
};
