import json

from src.operations.tasks import queue_depths

if __name__ == "__main__":
    print(json.dumps(queue_depths(), ensure_ascii=False, sort_keys=True))
