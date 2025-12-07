"""
Kafka Consumer Wrapper using aiokafka
Native async Kafka consumer as required by assignment
"""

import logging
import json
from typing import List, Optional, AsyncIterator, Dict, Any

from aiokafka import AIOKafkaConsumer
from aiokafka.errors import KafkaError

from config import settings

logger = logging.getLogger(__name__)


class KafkaConsumerWrapper:
    """
    Native async Kafka consumer using aiokafka

    Provides async iteration over messages from subscribed topics
    No thread pool executors needed - aiokafka is natively async
    """

    def __init__(
        self,
        topics: List[str],
        group_id: str = None,
        bootstrap_servers: str = None,
        auto_offset_reset: str = "latest",
        enable_auto_commit: bool = True
    ):
        """
        Initialize Kafka consumer

        Args:
            topics: List of topics to subscribe to
            group_id: Consumer group ID
            bootstrap_servers: Kafka broker addresses
            auto_offset_reset: Where to start reading (earliest/latest)
            enable_auto_commit: Auto commit offsets
        """
        self.topics = topics
        self.group_id = group_id or settings.KAFKA_CONSUMER_GROUP
        self.bootstrap_servers = bootstrap_servers or settings.KAFKA_BOOTSTRAP_SERVERS
        self.auto_offset_reset = auto_offset_reset
        self.enable_auto_commit = enable_auto_commit

        self._consumer: Optional[AIOKafkaConsumer] = None
        self._running = False

    async def start(self):
        """Start the Kafka consumer"""
        if self._consumer:
            return

        try:
            self._consumer = AIOKafkaConsumer(
                *self.topics,
                bootstrap_servers=self.bootstrap_servers,
                group_id=self.group_id,
                auto_offset_reset=self.auto_offset_reset,
                enable_auto_commit=self.enable_auto_commit,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")) if m else None,
                key_deserializer=lambda k: k.decode("utf-8") if k else None,
                session_timeout_ms=30000,
                heartbeat_interval_ms=3000,
                max_poll_interval_ms=300000,
                request_timeout_ms=40000
            )

            await self._consumer.start()
            self._running = True
            logger.info(f"Kafka consumer started, subscribed to: {self.topics}")

        except KafkaError as e:
            logger.error(f"Failed to start Kafka consumer: {e}")
            raise

    async def stop(self):
        """Stop the Kafka consumer"""
        self._running = False

        if self._consumer:
            try:
                await self._consumer.stop()
                logger.info("Kafka consumer stopped")
            except Exception as e:
                logger.error(f"Error stopping Kafka consumer: {e}")
            finally:
                self._consumer = None

    def __aiter__(self) -> AsyncIterator[Dict]:
        """Allow async iteration over messages"""
        return self

    async def __anext__(self) -> Dict:
        """Get next message asynchronously using native aiokafka"""
        if not self._running or not self._consumer:
            raise StopAsyncIteration

        try:
            # Native async iteration - no thread pool needed
            message = await self._consumer.getone()

            logger.debug(
                f"Received message from {message.topic} "
                f"partition {message.partition} "
                f"offset {message.offset}"
            )

            value = message.value

            # Add metadata
            if isinstance(value, dict):
                value["_kafka_topic"] = message.topic
                value["_kafka_partition"] = message.partition
                value["_kafka_offset"] = message.offset
                value["_kafka_key"] = message.key
                value["_kafka_timestamp"] = message.timestamp

            return value

        except Exception as e:
            if not self._running:
                raise StopAsyncIteration
            logger.error(f"Error getting Kafka message: {e}")
            raise StopAsyncIteration

    async def consume_batch(self, max_records: int = 100, timeout_ms: int = 5000) -> List[Dict]:
        """
        Consume a batch of messages

        Args:
            max_records: Maximum records to fetch
            timeout_ms: Timeout in milliseconds

        Returns:
            List of message dicts
        """
        if not self._consumer:
            return []

        messages = []

        try:
            # Native async batch fetch
            records = await self._consumer.getmany(
                timeout_ms=timeout_ms,
                max_records=max_records
            )

            for topic_partition, msgs in records.items():
                for msg in msgs:
                    value = msg.value
                    if isinstance(value, dict):
                        value["_kafka_topic"] = topic_partition.topic
                        value["_kafka_partition"] = topic_partition.partition
                        value["_kafka_key"] = msg.key
                    messages.append(value)

        except Exception as e:
            logger.error(f"Error consuming batch: {e}")

        return messages

    async def commit(self):
        """Manually commit offsets"""
        if self._consumer and not self.enable_auto_commit:
            await self._consumer.commit()

    async def seek_to_beginning(self):
        """Seek to beginning of all partitions"""
        if self._consumer:
            partitions = self._consumer.assignment()
            for partition in partitions:
                await self._consumer.seek_to_beginning(partition)

    async def seek_to_end(self):
        """Seek to end of all partitions"""
        if self._consumer:
            partitions = self._consumer.assignment()
            for partition in partitions:
                await self._consumer.seek_to_end(partition)

    @property
    def is_running(self) -> bool:
        """Check if consumer is running"""
        return self._running and self._consumer is not None
