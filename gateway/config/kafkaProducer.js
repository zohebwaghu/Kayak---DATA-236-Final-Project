/**
 * Kafka producer singleton for the API Gateway
 * Provides lazy initialization and graceful shutdown.
 */

const { Kafka, logLevel } = require('kafkajs');

let producer;
let kafka;

const initProducer = ({ clientId = 'gateway-producer', brokers = ['kafka:9093'] } = {}) => {
  if (producer) return producer;

  kafka = new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.INFO,
    retry: { initialRetryTime: 200, retries: 8 },
  });

  producer = kafka.producer({ allowAutoTopicCreation: true, transactionTimeout: 30000 });
  producer.connect().then(() => {
    console.log(`✅ Gateway Kafka producer connected (${clientId})`);
  }).catch((err) => {
    console.error('❌ Failed to connect gateway Kafka producer:', err);
  });

  producer.on('producer.disconnect', () => console.warn('⚠️ Gateway Kafka producer disconnected'));
  producer.on('producer.network.request_timeout', () => console.warn('⚠️ Gateway Kafka network timeout'));

  return producer;
};

const getProducer = () => {
  if (!producer) {
    throw new Error('Gateway Kafka producer not initialized. Call initProducer first.');
  }
  return producer;
};

const shutdownProducer = async () => {
  if (producer) {
    try {
      await producer.disconnect();
      console.log('✅ Gateway Kafka producer disconnected');
    } catch (err) {
      console.error('❌ Error disconnecting gateway Kafka producer:', err);
    }
  }
};

module.exports = { initProducer, getProducer, shutdownProducer };
