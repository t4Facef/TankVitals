/*
 * ============================================================================
 *  TankVitals - Teste de fiacao
 * ============================================================================
 *
 *  Serve so para conferir se o circuito do diagram.json esta ligado certo:
 *  le os 4 sensores, imprime no monitor serial e pisca o LED.
 *
 *  Nao tem Wi-Fi, nao tem MQTT e nao publica nada. O firmware de verdade e a
 *  sequencia FW-02 -> FW-05 do backlog (docs/TAREFAS.md).
 *
 *  Como usar:
 *    1. projeto no wokwi.com criado como ESP32 -> Arduino
 *    2. cole o diagram.json da pasta acima
 *    3. cole este arquivo no sketch.ino
 *    4. adicione as bibliotecas do libraries.txt desta pasta
 *    5. rode e confira a saida no monitor serial
 * ============================================================================
 */

#include <OneWire.h>
#include <DallasTemperature.h>

// Pinos - iguais aos do diagram.json
static const int PIN_ONEWIRE   = 4;
static const int PIN_TRIG      = 5;
static const int PIN_ECHO      = 18;
static const int PIN_LED       = 19;
static const int PIN_PH        = 34;   // ADC1
static const int PIN_TURBIDITY = 35;   // ADC1

// Geometria do tanque, em cm (ARQUITETURA §3)
static const float DIST_TANQUE_CHEIO = 5.0f;
static const float DIST_TANQUE_VAZIO = 45.0f;

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature dallas(&oneWire);

bool ledAceso = false;

// ---------------------------------------------------------------------------
// Leitura dos sensores
// ---------------------------------------------------------------------------

float lerTemperatura() {
  dallas.requestTemperatures();
  float t = dallas.getTempCByIndex(0);
  if (t <= -100.0f) return NAN;   // -127 = sensor nao respondeu
  return t;
}

float lerPh() {
  return (analogRead(PIN_PH) * 14.0f) / 4095.0f;
}

float lerTurbidez() {
  float ntu = ((4095.0f - analogRead(PIN_TURBIDITY)) * 100.0f) / 4095.0f;
  return ntu < 0.0f ? 0.0f : ntu;
}

float lerDistancia() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  unsigned long dur = pulseIn(PIN_ECHO, HIGH, 30000UL);
  if (dur == 0) return NAN;
  return (dur * 0.0343f) / 2.0f;
}

float distanciaParaNivel(float dist) {
  if (isnan(dist)) return NAN;
  float pct = ((DIST_TANQUE_VAZIO - dist) * 100.0f) /
              (DIST_TANQUE_VAZIO - DIST_TANQUE_CHEIO);
  if (pct < 0.0f)   pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return pct;
}

// Imprime o valor ou "--" quando a leitura falhou.
void imprimir(const char *rotulo, float valor, const char *unidade, int casas) {
  Serial.print(rotulo);
  Serial.print("=");
  if (isnan(valor)) Serial.print("--");
  else              Serial.print(valor, casas);
  Serial.print(unidade);
}

// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n=== TankVitals - teste de fiacao ===");

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  analogReadResolution(12);          // 0..4095
  analogSetAttenuation(ADC_11db);    // faixa util ~0..3.3 V

  dallas.begin();
  Serial.print("DS18B20 encontrados no barramento: ");
  Serial.println(dallas.getDeviceCount());
  if (dallas.getDeviceCount() == 0) {
    Serial.println("  -> confira o pino DQ no GPIO 4 e o pull-up de 4.7k ate o 3V3");
  }
  Serial.println();
}

void loop() {
  float temp     = lerTemperatura();
  float ph       = lerPh();
  float turbidez = lerTurbidez();
  float dist     = lerDistancia();
  float nivel    = distanciaParaNivel(dist);

  imprimir("temp", temp, " C", 2);
  Serial.print("  |  ");
  imprimir("pH", ph, "", 2);
  Serial.print("  |  ");
  imprimir("nivel", nivel, " %", 1);
  Serial.print(" (dist ");
  if (isnan(dist)) Serial.print("--");
  else             Serial.print(dist, 1);
  Serial.print(" cm)  |  ");
  imprimir("turbidez", turbidez, " NTU", 1);
  Serial.println();

  // Alterna o LED a cada leitura: se ele ficar aceso direto, o resistor de
  // 220 ohm esta ligado no 3V3 em vez do GPIO 19.
  ledAceso = !ledAceso;
  digitalWrite(PIN_LED, ledAceso ? HIGH : LOW);

  delay(1000);
}
