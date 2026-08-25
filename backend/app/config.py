"""Configuração da aplicação — lida do .env da raiz do projeto.

Tarefa: BE-01
Contrato: docs/ARQUITETURA.md §8 (variáveis de ambiente) e §5 (faixas seguras)

Regra: nenhum valor configurável pode estar espalhado pelo código. Se é
endereço, credencial ou limite de faixa, mora aqui.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração única da aplicação.

    TODO(BE-01): declarar os campos abaixo com tipo e valor padrão, seguindo
    exatamente os nomes da ARQUITETURA §8.

    MQTT:
        mqtt_host, mqtt_port, mqtt_username, mqtt_password,
        mqtt_topic_prefix, mqtt_client_id

    InfluxDB:
        influx_url, influx_token, influx_org, influx_bucket

    API:
        api_host, api_port, cors_origins

    Faixas seguras (ARQUITETURA §5):
        temp_ok_min, temp_ok_max, ph_ok_min, ph_ok_max,
        level_ok_min, turbidity_ok_max

    Atenção ao critério de aceite: faltando INFLUX_TOKEN, a aplicação deve
    falhar na inicialização com mensagem clara — e não estourar erro genérico
    mais tarde, na primeira escrita.
    """

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Instância única importada pelo resto da aplicação.
# TODO(BE-01): settings = Settings()
